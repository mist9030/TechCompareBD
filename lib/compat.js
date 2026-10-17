// Basic rule-based compatibility checker for the PC Builder.
// Returns a list of { level: 'error'|'warning'|'ok', message }.
// An EMPTY list means "nothing could be checked" (not "all fine").
//
// Scraped products often have no Socket/Memory spec, so every check first
// uses the spec value and, when it is missing, falls back to what can be read
// from the product NAME (e.g. "Ryzen 7 5800X" -> AM4, "B650M" -> AM5).

function wattNum(str) {
  if (!str) return null;
  const m = String(str).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function ddrGen(specStr) {
  if (!specStr) return null;
  const m = String(specStr).match(/DDR(\d)/i);
  return m ? `DDR${m[1]}` : null;
}

// "LGA 1700" / "lga1700" / "Socket AM5" -> "LGA1700" / "AM5"
function normSocket(s) {
  if (!s) return null;
  const t = String(s).toUpperCase().replace(/SOCKET/g, "").replace(/[^A-Z0-9]/g, "");
  return t || null;
}

function cpuSocket(cpu) {
  const fromSpec = normSocket(cpu?.specs?.Socket);
  if (fromSpec) return fromSpec;
  const n = String(cpu?.name || "");
  const ryzen = n.match(/ryzen\s*(?:[3579]|ai)?\s*(?:max\+?\s*)?(\d{4})/i);
  if (/ryzen/i.test(n) && ryzen) return Number(ryzen[1]) >= 7000 ? "AM5" : "AM4";
  if (/core\s*ultra/i.test(n)) return "LGA1851";
  const intel = n.match(/\bi[3579]\s*-?\s*(\d{4,5})/i);
  if (intel) {
    const digits = intel[1];
    const gen = digits.length === 5 ? Number(digits.slice(0, 2)) : Number(digits[0]);
    if (gen >= 12 && gen <= 14) return "LGA1700";
    if (gen === 10 || gen === 11) return "LGA1200";
    if (gen >= 6 && gen <= 9) return "LGA1151";
  }
  return null;
}

const CHIPSET_SOCKET = [
  [/\b(?:A620|B650|X670|B840|B850|X870)[A-Z]{0,2}\b/i, "AM5"],
  [/\b(?:A320|B350|X370|B450|X470|A520|B550|X570)[A-Z]{0,2}\b/i, "AM4"],
  [/\b(?:H410|B460|H470|Z490|H510|B560|H570|Z590)[A-Z]{0,2}\b/i, "LGA1200"],
  [/\b(?:H610|B660|H670|Z690|B760|H770|Z790)[A-Z]{0,2}\b/i, "LGA1700"],
  [/\b(?:H810|B860|Z890)[A-Z]{0,2}\b/i, "LGA1851"],
];

function moboSocket(mobo) {
  const fromSpec = normSocket(mobo?.specs?.Socket);
  if (fromSpec) return fromSpec;
  const text = `${mobo?.name || ""} ${mobo?.specs?.Chipset || ""}`;
  for (const [re, socket] of CHIPSET_SOCKET) if (re.test(text)) return socket;
  return null;
}

function moboMemoryGen(mobo) {
  const direct = ddrGen(mobo?.specs?.Memory) || ddrGen(mobo?.name);
  if (direct) return direct;
  const s = moboSocket(mobo);
  if (s === "AM5" || s === "LGA1851") return "DDR5";
  if (s === "AM4" || s === "LGA1200" || s === "LGA1151") return "DDR4";
  return null; // LGA1700 boards exist in both DDR4 and DDR5 variants
}

export function checkCompatibility(build) {
  const issues = [];
  const { cpu, mobo, ram, gpu, psu } = build;

  if (cpu && mobo) {
    const a = cpuSocket(cpu);
    const b = moboSocket(mobo);
    if (a && b) {
      if (a === b) {
        issues.push({ level: "ok", message: `CPU socket ${a} matches motherboard socket.` });
      } else {
        issues.push({
          level: "error",
          message: `Socket mismatch: ${cpu.name} is ${a}, but ${mobo.name} is ${b}.`,
        });
      }
    }
  }

  if (ram && mobo) {
    const ramGen = ddrGen(ram.name) || ddrGen(ram.specs?.Capacity) || ddrGen(JSON.stringify(ram.specs));
    const moboGen = moboMemoryGen(mobo);
    if (ramGen && moboGen) {
      if (ramGen === moboGen) {
        issues.push({ level: "ok", message: `${ramGen} RAM is supported by this motherboard.` });
      } else {
        issues.push({
          level: "error",
          message: `Memory mismatch: ${ram.name} is ${ramGen}, but ${mobo.name} supports ${moboGen}.`,
        });
      }
    }
  }

  if (gpu && psu) {
    const recommended = wattNum(gpu.specs?.["Recommended PSU"]);
    const selected = wattNum(psu.specs?.Wattage);
    if (recommended && selected) {
      if (selected >= recommended) {
        issues.push({ level: "ok", message: `${psu.name} (${selected}W) meets the ${recommended}W recommended for ${gpu.name}.` });
      } else {
        issues.push({
          level: "warning",
          message: `${gpu.name} recommends a ${recommended}W PSU — selected ${psu.name} is only ${selected}W.`,
        });
      }
    }
  }

  return issues;
}

export function compatSummary(issues) {
  if (issues.some((i) => i.level === "error")) return "error";
  if (issues.some((i) => i.level === "warning")) return "warning";
  if (issues.length) return "ok";
  return "none";
}

// Basic rule-based compatibility checker for the PC Builder.
// Returns a list of { level: 'error'|'warning'|'ok', message }.
// This is intentionally simple (socket + PSU wattage + RAM generation)
// rather than a full component-database compatibility engine — it is
// meant to demonstrate the business-logic layer described in the SDP
// scope ("basic compatibility checking"), not to replace PCPartPicker.

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

export function checkCompatibility(build) {
  const issues = [];
  const { cpu, mobo, ram, gpu, psu } = build;

  if (cpu && mobo) {
    const cpuSocket = cpu.specs?.Socket;
    const moboSocket = mobo.specs?.Socket;
    if (cpuSocket && moboSocket) {
      if (cpuSocket === moboSocket) {
        issues.push({ level: "ok", message: `CPU socket ${cpuSocket} matches motherboard socket.` });
      } else {
        issues.push({
          level: "error",
          message: `Socket mismatch: ${cpu.name} is ${cpuSocket}, but ${mobo.name} is ${moboSocket}.`,
        });
      }
    }
  }

  if (ram && mobo) {
    const ramGen = ddrGen(ram.name) || ddrGen(ram.specs?.Capacity) || ddrGen(JSON.stringify(ram.specs));
    const moboGen = ddrGen(mobo.specs?.Memory) || ddrGen(mobo.name);
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

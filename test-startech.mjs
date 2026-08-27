import { fetchHtml } from "./lib/ingestion/adapters/shared.js";
import * as cheerio from "cheerio";

const html = await fetchHtml("https://www.startech.com.bd/component/processor");
const $ = cheerio.load(html);

const wrap = $(".main-content.p-items-wrap").first();

console.log("WRAP CHILDREN:", wrap.children().length);

wrap.children().slice(0, 5).each((i, el) => {
  console.log(`\n--- ITEM ${i + 1} ---`);
  console.log("TAG:", el.tagName);
  console.log("CLASS:", $(el).attr("class"));
  console.log(
    "TEXT:",
    $(el).text().replace(/\s+/g, " ").trim().slice(0, 250)
  );
});

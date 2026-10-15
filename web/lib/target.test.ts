import { expect, test } from "bun:test";
import { parseTarget, OPTED_OUT } from "./target";

test("parseTarget", () => {
  expect(parseTarget("torvalds")).toEqual({ target: "torvalds" });
  expect(parseTarget("  @torvalds ")).toEqual({ target: "torvalds" });
  expect(parseTarget("torvalds/linux")).toEqual({ target: "torvalds/linux" });
  expect(parseTarget("https://github.com/torvalds/linux/tree/master/kernel")).toEqual({ target: "torvalds/linux" });
  expect(parseTarget("github.com/torvalds?tab=repositories")).toEqual({ target: "torvalds" });
  expect(parseTarget("https://github.com/vercel/next.js.git")).toEqual({ target: "vercel/next.js" });
  expect(parseTarget("")).toHaveProperty("error");
  expect(parseTarget("-bad")).toHaveProperty("error");
  expect(parseTarget("a--b")).toHaveProperty("error");
  expect(parseTarget("api")).toHaveProperty("error");
  expect(parseTarget("API/foo")).toHaveProperty("error");
  expect(parseTarget("about")).toHaveProperty("error");
  expect(parseTarget("torvalds/li nux")).toHaveProperty("error");

  OPTED_OUT.push("someone");
  expect(parseTarget("Someone/repo")).toHaveProperty("error");
});

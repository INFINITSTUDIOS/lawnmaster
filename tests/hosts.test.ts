import { describe, expect, it } from "vitest";
import { classifyHost, normalizeDomain, slugify } from "@/lib/hosts";

describe("classifyHost", () => {
  const root = "lawnmaster.app";
  it("recognises the platform", () => {
    expect(classifyHost("lawnmaster.app", root)).toEqual({ kind: "platform" });
    expect(classifyHost("www.lawnmaster.app", root)).toEqual({ kind: "platform" });
    expect(classifyHost("my-app-git-x.vercel.app", root)).toEqual({ kind: "platform" });
    expect(classifyHost(null, root)).toEqual({ kind: "platform" });
  });
  it("recognises tenant subdomains", () => {
    expect(classifyHost("greenco.lawnmaster.app", root)).toEqual({ kind: "tenant-slug", slug: "greenco" });
    expect(classifyHost("GreenCo.localhost:3000", "localhost:3000")).toEqual({ kind: "tenant-slug", slug: "greenco" });
  });
  it("does not treat reserved or nested subdomains as tenants", () => {
    expect(classifyHost("app.lawnmaster.app", root)).toEqual({ kind: "platform" });
    expect(classifyHost("a.b.lawnmaster.app", root)).toEqual({ kind: "platform" });
  });
  it("treats any other host as a custom domain", () => {
    expect(classifyHost("lawns.example.com", root)).toEqual({ kind: "tenant-domain", domain: "lawns.example.com" });
    expect(classifyHost("evil-lawnmaster.app", root)).toEqual({ kind: "tenant-domain", domain: "evil-lawnmaster.app" });
  });
});

describe("domains and slugs", () => {
  it("normalises domains and rejects bad ones", () => {
    expect(normalizeDomain(" https://Lawns.Example.com/path ")).toBe("lawns.example.com");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });
  it("slugifies names", () => {
    expect(slugify("Green & Co. Lawn Care!")).toBe("green-co-lawn-care");
  });
});

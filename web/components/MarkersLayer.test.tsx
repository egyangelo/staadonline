/**
 * MarkersLayer smoke test (03-08 Task 2, D-07).
 * The component returns null without a model/coords, so a plain render call
 * is safe in the node environment — asserting the guard fires and no crash.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { MarkersLayer } from "./MarkersLayer";

describe("MarkersLayer smoke", () => {
  it("renders empty (null) without a mounted group when hidden", () => {
    // Environment has no R3F store providers mounted; the component guards on
    // markersVisible + model store. With no provider, subscribing returns the
    // default zustand store which has markersVisible: true and model: null,
    // so the component returns null.
    const html = renderToStaticMarkup(createElement(MarkersLayer, { coords: null }));
    // renderToStaticMarkup of a component returning null yields empty string.
    expect(html.trim()).toBe("");
  });
});
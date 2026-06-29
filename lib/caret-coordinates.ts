/**
 * Caret pixel coordinates for a <textarea>.
 *
 * Textareas expose no native API for the caret's pixel position, so we mirror
 * the textarea's content and computed styles into a hidden element and measure
 * where a marker span at the caret index lands. This is the well-established
 * "mirror div" technique (cf. the textarea-caret-position library).
 *
 * Returned coordinates are relative to the textarea's own top-left (border box),
 * matching `offsetTop`/`offsetLeft` semantics — callers convert to viewport
 * coordinates with `getBoundingClientRect()` + scroll offsets as needed.
 */
export type CaretCoordinates = {
  top: number;
  left: number;
  /** Resolved line height in px (falls back to ~1.2 × font-size). */
  lineHeight: number;
};

// Style properties that affect text layout and therefore caret position. Kept in
// one place so the mirror element wraps exactly like the real textarea.
const MIRRORED_PROPERTIES = [
  "boxSizing",
  "width",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
] as const;

export function getCaretCoordinates(
  element: HTMLTextAreaElement,
  position: number,
): CaretCoordinates {
  const computed = window.getComputedStyle(element);
  const mirror = document.createElement("div");
  const style = mirror.style;

  style.position = "absolute";
  style.visibility = "hidden";
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.overflow = "hidden";

  for (const prop of MIRRORED_PROPERTIES) {
    style.setProperty(prop, computed.getPropertyValue(prop));
  }

  mirror.textContent = element.value.slice(0, position);
  const marker = document.createElement("span");
  // A non-empty marker guarantees a measurable box, even at end-of-text.
  marker.textContent = element.value.slice(position) || ".";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const lineHeight =
    parseInt(computed.lineHeight, 10) ||
    Math.round(parseInt(computed.fontSize, 10) * 1.2);
  const coords: CaretCoordinates = {
    top: marker.offsetTop + parseInt(computed.borderTopWidth, 10),
    left: marker.offsetLeft + parseInt(computed.borderLeftWidth, 10),
    lineHeight,
  };
  document.body.removeChild(mirror);

  return coords;
}

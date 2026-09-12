import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("Still Signature layout contracts", () => {
  for (const name of [
    "statusline_widget",
    "statusline_widget_small",
    "statusline_widget_compact",
  ]) {
    it(`${name} uses supported RemoteViews and a single surface`, () => {
      const xml = source(`../../android/app/src/main/res/layout/${name}.xml`);
      const tags = [...xml.matchAll(/<([A-Z]\w*)\b/g)].map(
        (match) => match[1] ?? "",
      );
      expect(
        tags.every((tag) =>
          ["FrameLayout", "LinearLayout", "TextView", "ImageView"].includes(
            tag,
          ),
        ),
      ).toBe(true);
      expect(xml).not.toContain("widget_grid");
      expect(xml.match(/android:background=/g)).toHaveLength(1);
      expect(xml).toContain('android:layout_marginStart="6dp"');
      for (const id of [
        "widgetRoot",
        "widgetPopulated",
        "widgetEmpty",
        "widgetMeter",
        "widgetEmptyMeter",
        "widgetQuotaNumber",
        "widgetQuotaPercent",
      ]) {
        expect(xml).toContain(`@+id/${id}`);
      }
    });
  }

  it("keeps Android's default 4 × 1 size", () => {
    const xml = source(
      "../../android/app/src/main/res/xml-v31/statusline_widget_info.xml",
    );
    expect(xml).toContain('android:targetCellWidth="4"');
    expect(xml).toContain('android:targetCellHeight="1"');
  });

  it("keeps the segmented logo rhythm and the separate white terminal marker", () => {
    const css = source("./styles.css");
    expect(css).toMatch(/var\(--signal\) 0 4px/);
    expect(css).toMatch(/transparent 4px 6px/);
    expect(css).toMatch(/\.signature-tip\s*\{[^}]*background:\s*#fff/);
    expect(css).toMatch(/\.quota-suffix\s*\{[^}]*margin-left:\s*12px/);
  });
});

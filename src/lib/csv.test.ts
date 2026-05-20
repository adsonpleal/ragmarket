import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("emits header + rows with CRLF terminators and a UTF-8 BOM", () => {
    const out = toCsv([{ a: 1, b: 2 }], ["a", "b"]);
    expect(out).toBe("﻿a,b\r\n1,2\r\n");
  });

  it("quotes fields containing comma, quote, or newline; doubles internal quotes", () => {
    const out = toCsv(
      [
        { name: "Hello, world", note: 'he said "hi"', body: "line1\nline2" },
      ],
      ["name", "note", "body"],
    );
    expect(out).toBe(
      '﻿name,note,body\r\n"Hello, world","he said ""hi""","line1\nline2"\r\n',
    );
  });

  it("treats null/undefined as empty cells", () => {
    const out = toCsv([{ a: null, b: undefined, c: 0 }], ["a", "b", "c"]);
    expect(out).toBe("﻿a,b,c\r\n,,0\r\n");
  });

  it("returns just the header when there are no rows", () => {
    const out = toCsv([], ["a", "b"]);
    expect(out).toBe("﻿a,b\r\n");
  });
});

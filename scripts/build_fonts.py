"""Reproducible local WOFF2 subsets; originals and their OFL notices are retained."""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "assets" / "fonts"
SOURCES = (
    ("0xproto-nerd-font-regular.ttf", "0xproto-latin-regular.woff2"),
    ("0xproto-nerd-font-bold.ttf", "0xproto-latin-bold.woff2"),
    ("departure-mono-nerd-font.otf", "departure-mono-latin.woff2"),
)


def main():
    # Latin + extended Latin, punctuation, currencies, arrows and terminal box drawing.
    # Broader than today's copy so routine English/German edits need no regeneration.
    codepoints = set(range(0x20, 0x250)) | set(range(0x2000, 0x2070))
    codepoints |= set(range(0x20A0, 0x20D0)) | set(range(0x2190, 0x2200))
    codepoints |= set(range(0x2500, 0x25A0))
    for source, output in SOURCES:
        with TTFont(FONTS / source, recalcTimestamp=False) as font:
            options = subset.Options()
            options.name_IDs = ["*"]  # Preserve copyright, licence and attribution metadata.
            options.name_languages = ["*"]
            options.layout_features = ["*"]
            subsetter = subset.Subsetter(options=options)
            subsetter.populate(unicodes=codepoints)
            subsetter.subset(font)
            font.flavor = "woff2"
            font.save(FONTS / output)
        print(f"{output}: {(FONTS / output).stat().st_size:,} bytes")


if __name__ == "__main__":
    main()

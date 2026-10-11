# Welcome Book fonts

Bundled locally for native and browser use; no runtime font service.

Sources downloaded October 4, 2026 from Google Fonts:
- https://github.com/google/fonts/tree/main/ofl/fraunces
- https://github.com/google/fonts/tree/main/ofl/dmsans

Both use the SIL Open Font License; full notices accompany the assets here and in the Swift package resources.

Static instances generated with fontTools from the upright variable TTF files:
- Fraunces: weight 400/500, optical size 48, softness 35, wonk 0.
- DM Sans: weight 400/500/600/700, optical size 18.

TTF files live in `clients/GrataDomumKit/Sources/GrataDomumKit/Resources/Fonts`;
matching WOFF2 files live here. Name tables identify explicit family/weight and
PostScript names for reliable native registration. No glyph outlines were edited
beyond variable-font instancing. Fraunces is reserved for display headings; DM Sans
handles utility text. Native system navigation and SF Symbols remain platform UI.

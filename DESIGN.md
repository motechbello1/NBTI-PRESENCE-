# NBTI Presence visual system

NBTI Presence is treated as a verification instrument and an official register, not as a generic software dashboard. The visual references are ruled attendance sheets, machine-readable credentials, cut ID-card corners and the fine security line work used on official documents.

## Palette

- Archive Ink `#101814`: primary text, camera surfaces and high-authority rules.
- Ledger White `#F4F6F2`: the main working field. Its cool cast avoids the fashionable cream-and-terracotta look.
- Filing Rule `#CAD1CB`: borders, register rows and inactive instrument marks.
- Bureau Green `#176B4A`: primary actions and a cleared verification state. It begins with Nigerian green but is darker and less literal than the flag.
- Review Amber `#A05E12`: a held state or a record needing attention.
- Refusal Red `#B33A32`: refusals, destructive actions and incident emphasis only.
- Authority Blue `#1E5AA8`: a formally assigned HOD or Director check only.
- Director-General Gold `#7A5200`: the DG check only; darkened to retain AA contrast on Ledger White.

Muted surfaces and secondary text are mixed from Archive Ink, Ledger White and Filing Rule. Authority Blue and Director-General Gold are identity exceptions, never general interface accents. No gradients are used.

## Typography

Literata is used sparingly for page titles and major institutional statements. Its shaped serifs give the service authority without making routine interface copy feel ceremonial. IBM Plex Sans carries controls, forms and explanatory copy because it remains clear at small sizes on mid-range phone screens. IBM Plex Mono is reserved for values the system measured rather than wrote: time, date, staff number, coordinates, GPS accuracy and verification scores.

## Layout and motion

Pages use an asymmetric twelve-column register grid. Rules separate real groups of information; panels are not added merely to fill space. Credentials alone receive a cut corner. Entry motion completes within 600ms and uses only opacity and transforms. Verification progress, counters and row feedback respect `prefers-reduced-motion`.

## The single risk

A narrow guilloché security rail is the one deliberately bold device. It is justified because it refers to document authentication and becomes the real four-gate progress rail during verification. Everything around it stays quiet so it reads as system identity rather than decoration.

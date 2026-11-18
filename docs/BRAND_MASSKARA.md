# MassKara in the brand, without the glare

Research notes and recommendations for folding MassKara Festival culture into Better Maskara's look. Written 2026-09-28. Sources are linked at the end.

## What the festival's art actually comes from

* **Born from a hard year.** MassKara started on 19 October 1980, Bacolod's Charter Day, after the sugar price crash and the MV Don Juan sinking that April. The smiling mask was a deliberate act of resilience, not decoration. [1][2]
* **"Many faces."** The name joins English *mass* and Spanish *cara* (face), and puns on *maskara* (mask). Bacolod is the "City of Smiles". [1]
* **Hand-made, local materials.** Painter and cartoonist Ely Santiago named the festival and brought the first painted papier-mâché masks. The earliest masks "showed native Filipino motifs and used indigenous material", and coconut husk was common. [3][4][5]
* **Every mask was different on purpose.** Founding artist Rodney Martinez says barangay farmers, fisherfolk, women and children made their own masks, because the organisers wanted "a lot of different faces, not only one design". He regrets that today's masks are factory-made from templates. [4]
* **It got louder over time.** The masks "morphed into elaborate happy faces" as the festival commercialised [3], and Electric MassKara added neon and LED costumes on lit floats. [1]
* **The yearly logo carries a local story.** 2024's logo showed endangered Negros animals and plants (the Negros bleeding-heart dove, the Visayan spotted deer, an endemic orchid) with sapphire motifs. [6] 2025's "Mass-Kasingkasing" by Bacolod illustrator Paula Romaine Salmingo drew on the Don Juan story, piaya and local art, and paid homage to Ely Santiago's original logo. [7]

The takeaway: the authentic MassKara look is **handmade, varied, local and resilient**. The glitter, sequins and neon are the loud recent layer. We borrow from the first layer and only season with the second.

## How this app applies it (this branch)

| Idea | Where |
| --- | --- |
| Paper and fibre, not white and gray. The neutrals are abaca beige; ink is a warm soil brown. | `neutral` and `abaca` scales in `src/index.css` |
| Woven, not printed. Banig basket weave for section bands, sawali bamboo cross-hatch for date strips, dotted paper grain behind everything. | `.weave`, `.sawali`, body background |
| The mask as a line drawing. One smiling mask with a feather crown and a petal burst (read also as the sun on the flag) sit behind the page at 16% opacity in light mode and 7% in dark. | `src/craft/MaskArt.tsx` |
| Festival colour as thread. Magenta, gold and teal appear only as small threads and knots inside the weave, the primary action, the Official badge and the "Happening now" card. | `.weave-accents`, `NowCard` |
| Deep dyes for big areas. The one large coloured surface is a deep mulberry (brand 800 to 950), not hot pink. | `NowCard` |
| A voice with some warmth. Fraunces, a soft serif, for headings; Inter stays for reading. | `--font-display` |

## Rules to keep it from getting loud

The home header is the one exception to rules 1 to 3 and to "no gradients": a soft mesh of festival dyes, a rainbow splash and a flag-striped crown after the surroundings of the MassKara logo (never the mask itself). It earns the exception by staying faint: the art sits at 8% opacity (6% in dark mode), set by `--hero-art-opacity`, and fades out as the header compacts. Keep the detail and turn the opacity down rather than simplifying the art. The slatted basket weave of the Bacolod airport ceiling (`SlatWeave` in `src/craft/HeroArt.tsx`) is drawn and ready but not shown yet; it is meant for another part of the UI. Content below the header follows the rules as written.


1. **80 / 15 / 5.** About 80% of any screen is paper and ink, 15% abaca craft (weave, art, rules), and at most 5% festival colour.
2. **One loud thing per screen.** Only the event happening now gets a saturated block. Everything else is beige and brown.
3. **Saturated colour only at small sizes.** Full magenta, gold and teal are fine for a dot, a thread or a badge. Anything bigger than a button uses the 800–950 steps or a `-soft` tint.
4. **Line art, never clip art.** Masks, feathers and sequins are drawn as thin outlines in abaca. No gradients, glitter, glow or drop shadows on the art.
5. **Smile, don't grin.** Mask faces stay calm and friendly. No cartoon grins or eye sparkles.
6. **No confetti.** Motion is limited to the live dot. Reduced motion turns it off.
7. **Don't copy the official logo.** It changes every year and belongs to the city. At most borrow the year's theme (the endemic birds, the heart) as a quiet motif.

## Next ideas, if you want to go further

* **Commission "many faces".** Five or six mask line drawings by Bacolod artists, one per section, instead of the single mask. This is the most faithful nod to how the festival began, and it gives the app work no one else has.
* **Sugar as a second motif.** Cane leaves drawn like the mask feathers, and a muscovado-brown accent, tie the art to the 1980 sugar crisis and to Negros.
* **Electric MassKara at night.** In dark mode only, let the weave threads glow faintly, like LED costumes. Daytime stays matte.
* **Real photos later.** A credited photo of a local mask in the "Happening now" wedge where the weave sits now, as in the timeline reference.

## Sources

1. [MassKara Festival, Wikipedia](https://en.wikipedia.org/wiki/MassKara_Festival)
2. [All smiles for MassKara, Inquirer](https://newsinfo.inquirer.net/937944/philippine-festivals-philippine-fiestas-masskara-festival)
3. [MassKara wouldn't be MassKara without Bacolod's cadre of artists, Rappler](https://www.rappler.com/life-and-style/arts-culture/masskara-bacolod-cadre-artists-rosendo-roy-aguilar/)
4. [Unmasking the MassKara: the hidden origin of Bacolod City's festival, Interaksyon](https://interaksyon.philstar.com/breaking-news/2018/07/09/130223/unmasking-the-hidden-origin-of-bacolod-citys-masskara-festival/)
5. [MassKara Festival, Cultural Mapping of Panay and Guimaras](https://cmpg.upv.edu.ph/heritage/masskara-festival/)
6. [2024 MassKara Festival logo depicts threatened flora, fauna in Negros, SunStar](https://www.sunstar.com.ph/bacolod/2024-masskara-festival-logo-depicts-threatened-flora-fauna-in-negros)
7. [MassKara 2025 logo, theme unveiled, Manila Bulletin](https://mb.com.ph/2025/09/07/masskara-2025-logo-theme-unveiled)

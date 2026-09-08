# Generated garden artwork

Created with the built-in `image_gen` tool on 2026-09-06. These are new images. The supplied game mockups guided the art brief. No mockup text or interface was included in the assets.

PNG source images and unused revisions are retained in [artwork/](artwork/).
They stay outside `public/`, so the website build does not ship them. The app
loads only the current WebP images. The first WebP conversions used quality 86
and retained the full pixel dimensions. The original game artwork uses the
[project MIT license](../LICENSE).

| Asset | Dimensions | WebP size |
| --- | --- | --- |
| `docs/artwork/hero-garden.webp` | 1536 × 1024 | 95,008 bytes |
| `docs/artwork/hero-garden-live.webp` | 1536 × 1024 | 107,176 bytes |
| `docs/artwork/hero-garden-live-v2.webp` | 1536 × 1024 | 110,188 bytes |
| `public/assets/hero-garden-live-v3.webp` (current hero) | 1536 × 1024 | 138,624 bytes |
| `public/assets/leaderboard-garden.webp` | 1774 × 887 | 92,240 bytes |

The current hero's source PNG is
[`artwork/hero-garden-live-v3.png`](artwork/hero-garden-live-v3.png).
The ranking banner's source is
[`artwork/leaderboard-garden.png`](artwork/leaderboard-garden.png).
The five WebP files in `public/assets/game-backgrounds/` supply the rotating
game backgrounds; the original record does not include their full prompts.

## Live hero face edit

Edited `hero-garden.webp` with the built-in `image_gen` tool. Remove only both
eyes and the mouth from each large foreground pill (black near 730,755; white
near 1005,770). Fill those areas with the local lit body material and retain the
peach cheeks. Preserve the 1536 × 1024 frame, body positions and sizes, shadows,
highlights, garden, flowers, board, and tree including its face. Add no objects
or text. Retain the original composition, colors, lighting, and texture.

The edited PNG and earlier WebP versions are archived in `docs/artwork/`.
`HeroGarden` loads the current v3 WebP from `public/assets/` and overlays live SVG
faces in the same image coordinates. Both faces blink independently and share
the game's expression drawings.

## Hero prompt

Use case: stylized-concept

Asset type: finished raster illustration for a cute Othello game landing page hero, landscape 1536x1024.

Primary request: A beautiful premium 3D clay toy garden scene. Two adorable smooth round flattened pill game-piece characters stand in the foreground on a tiny soft moss island: a charcoal-black pill on the left and a warm ivory pill on the right. They have small shiny dark eyes with tiny white catches, curved happy open smiles, peach rosy cheeks, no arms or legs. Behind them is a large sage and olive-green Othello board with exactly eight rows and eight columns, gently tilted back in isometric perspective and holding a small central cluster of black and ivory disk pieces. A softly sculpted broccoli-shaped tree stands at back right with cute tiny face, leaves and little green bushes. A few small white daisies with golden centers and smooth warm gray pebbles surround the board.

Composition/framing: Wide landscape, camera slightly above eye level looking toward the little garden diorama. Garden scene fills the right 75% and lower two thirds of the image, with left quarter and upper left mostly empty warm cream for website text. Objects have clear silhouettes and generous breathing room. Soft edges blend into the warm cream background #fffaf2. No outer frame.

Style/medium: Extremely polished adorable tactile 3D clay render, rounded plush pill proportions, subtle ceramic softness, careful material detail, clean professional game art. Soft sunny afternoon lighting, delicate ambient occlusion and soft contact shadows, airy pale sky near the tree, friendly calm feeling. Refined sage greens, pale buttery yellow, charcoal and warm porcelain ivory, subtle peach cheeks. High quality crisp forms.

Constraints: NO lettering, NO text, NO logo, NO UI, NO buttons, NO watermarks. This is art only, not a website screenshot. No hands, no humans, no medical objects or capsule seams.

## Leaderboard prompt

Use case: stylized-concept

Asset type: website leaderboard banner illustration, landscape 1536x768.

Primary request: Beautiful polished cute 3D clay game art. An adorable warm ivory round flattened pill character with an elegant little gold crown sits proudly on a low moss-covered warm limestone podium at right center. Its small charcoal-black round pill friend stands alongside on the right. Both have small glossy dark eyes, smiling happy open mouths and soft peach rosy cheeks. No arms or legs. A tiny green leaf and a few small daisies grow near the podium, with rounded green bushes and smooth pebbles. Airy subtle light-blue sky with a few soft round clouds at top right. Cheerful sweet calm garden mood.

Composition: Wide horizontal banner. Characters and garden occupy the right half and lower edge. Leave the left half as empty soft warm cream #fffaf2 so a website can place large text there. The left edge and corners fade naturally into warm cream with no frame. Slightly elevated camera, faces visible from front. Ivory character larger and higher than charcoal character. Simple readable shapes.

Style: Premium adorable smooth clay 3D toy render, soft matte porcelain and tactile soft sculpted forms, smooth round surfaces, professionally art-directed, refined sage and pale green palette, small warm yellow accents, warm diffuse daylight, soft ambient shadows. Characters resemble squishy Othello game pieces.

Constraints: No text of any kind, no letters, no numbers, no logo, no watermark, no interface elements, no human figures, no additional characters. Art only.

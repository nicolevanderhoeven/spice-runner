# Spice Runner - Graphics Specifications

Complete technical specifications for all game graphics.

---

## Overview

The game uses **sprite sheets** (multiple frames in a single image) for animations. Each graphic has two versions:
- **1x** - Standard resolution (600x150 game canvas)
- **2x** - High-DPI/Retina displays (double the dimensions)

**File Format:** PNG with transparency
**Color Mode:** Grayscale/monochrome style (dark gray #535353 on transparent)

---

## 1. FREMEN SPRITE SHEET

### Dimensions
- **1x version:** 262px × 47px
- **2x version:** 524px × 94px

### Configuration (from code)
```javascript
WIDTH: 44px          // Width of each frame
HEIGHT: 47px         // Height of sprite
SPRITE_WIDTH: 262px  // Total sprite sheet width
```

### Sprite Sheet Layout (1x)
The sprite is a horizontal strip with 6 frames:

| Position | X-offset | Frame | Description |
|----------|----------|-------|-------------|
| Frame 1  | 0px      | 44×47 | Standing/Jumping (mouth closed) |
| Frame 2  | 44px     | 44×47 | Blinking (eyes closed) |
| Frame 3  | 88px     | 44×47 | Running - leg down |
| Frame 4  | 132px    | 44×47 | Running - leg up |
| Frame 5  | 176px    | 44×47 | Ducking - leg down |
| Frame 6  | 220px    | 44×47 | Crashed (X eyes) |

### Animation Sequences
- **WAITING:** Alternates frames 44px and 0px (blinking), 3 fps
- **RUNNING:** Alternates frames 88px and 132px, 12 fps
- **JUMPING:** Static frame at 0px, 60 fps
- **CRASHED:** Static frame at 220px, 60 fps

### Collision Boxes (for reference)
```javascript
[
  {x: 1, y: -1, width: 30, height: 26},  // Body
  {x: 32, y: 0, width: 8, height: 16},   // Head
  {x: 10, y: 35, width: 14, height: 8},  // Leg 1
  {x: 1, y: 24, width: 29, height: 5},   // Body lower
  {x: 5, y: 30, width: 21, height: 4},   // Mid section
  {x: 9, y: 34, width: 15, height: 4}    // Leg 2
]
```

---

## 2. OBSTACLES - LARGE CACTUS

### Dimensions
- **1x version:** 75px × 50px (3 variants side-by-side)
- **2x version:** 150px × 100px

### Configuration
```javascript
WIDTH: 25px per cactus
HEIGHT: 50px
Y_POSITION: 90px (from top of canvas)
```

### Sprite Sheet Layout
Horizontal strip with 3 different large cactus designs:
- **Cactus 1:** 0-25px (single tall cactus)
- **Cactus 2:** 25-50px (wider cactus)
- **Cactus 3:** 50-75px (multiple stems)

### Collision Boxes
```javascript
[
  {x: 0, y: 12, width: 7, height: 38},   // Left stem
  {x: 8, y: 0, width: 7, height: 49},    // Center stem
  {x: 13, y: 10, width: 10, height: 38}  // Right area
]
```

---

## 3. OBSTACLES - SMALL CACTUS

### Dimensions
- **1x version:** 51px × 35px (3 variants side-by-side)
- **2x version:** 102px × 70px

### Configuration
```javascript
WIDTH: 17px per cactus
HEIGHT: 35px
Y_POSITION: 105px (from top of canvas)
```

### Sprite Sheet Layout
Horizontal strip with 3 different small cactus designs:
- **Cactus 1:** 0-17px
- **Cactus 2:** 17-34px
- **Cactus 3:** 34-51px

### Collision Boxes
```javascript
[
  {x: 0, y: 7, width: 5, height: 27},   // Left stem
  {x: 4, y: 0, width: 6, height: 34},   // Center stem
  {x: 10, y: 4, width: 7, height: 14}   // Right stem
]
```

---

## 4. CLOUD

### Dimensions
- **1x version:** 46px × 13px
- **2x version:** 92px × 26px

### Configuration
```javascript
WIDTH: 46px
HEIGHT: 13px
Y_POSITION: Random between 30-71px from top
```

### Details
- Single static image (no animation)
- Moves slower than ground (creates parallax effect)
- Speed: 0.2 (BG_CLOUD_SPEED)

---

## 5. HORIZON (GROUND)

### Dimensions
- **1x version:** 1200px × 12px
- **2x version:** 2400px × 24px

### Configuration
```javascript
WIDTH: 600px (drawn in two 600px sections)
HEIGHT: 12px
Y_POSITION: 127px (from top of canvas)
```

### Details
- Two variations: flat and bumpy
- Tiles infinitely by drawing two sections
- Each section is 600px wide
- Contains subtle texture/pattern

---

## 6. RESTART BUTTON

### Dimensions
- **1x version:** 36px × 32px
- **2x version:** 72px × 64px

### Configuration
```javascript
WIDTH: 36px
HEIGHT: 32px
```

### Details
- Circular button with reload/restart icon
- Appears centered on screen after game over
- Single static image

---

## 7. TEXT SPRITE SHEET

### Dimensions
- **1x version:** 191px × 13px (approximate, contains digits 0-9 and "GAME OVER" text)
- **2x version:** 382px × 26px

### Configuration
```javascript
// Digit dimensions
WIDTH: 10px per digit
HEIGHT: 13px
DEST_WIDTH: 11px (spacing when drawn)

// Text dimensions (GAME OVER)
TEXT_WIDTH: 191px
TEXT_HEIGHT: 11px
TEXT_X: 0px
TEXT_Y: 13px
```

### Sprite Sheet Layout
Vertical arrangement of characters:

| Y-Position | Character |
|------------|-----------|
| 0px        | 0 |
| 13px       | 1 |
| 27px       | 2 |
| 40px       | 3 |
| 53px       | 4 |
| 67px       | 5 |
| 80px       | 6 |
| 93px       | 7 |
| 107px      | 8 |
| 120px      | 9 |
| 133px      | H (for "HI" score) |
| 146px      | I (for "HI" score) |

Plus "GAME OVER" text at Y: 13px

---

## Design Guidelines

### Color Palette
- **Primary Color:** #535353 (dark gray)
- **Background:** Transparent
- **Style:** Flat, minimalist, pixel art aesthetic

### Technical Requirements
1. **Transparency:** All sprites must have transparent backgrounds
2. **Anti-aliasing:** Minimal or none (crisp pixel edges)
3. **Alignment:** Sprites must align to exact pixel boundaries
4. **Consistency:** Maintain consistent line weights across all graphics

### Creating Custom Graphics

#### For 1x version:
1. Create at exact dimensions listed above
2. Use transparent background
3. Keep design simple and recognizable
4. Test visibility against light gray (#f7f7f7) background

#### For 2x version:
1. Create at exactly **2× the 1x dimensions**
2. Maintain same proportions and design
3. Keep pixel alignment (double each pixel)
4. Test on high-DPI display if possible

---

## Game Canvas Context

- **Canvas Size:** 600px × 150px (default)
- **Background Color:** #f7f7f7 (light gray)
- **Frame Rate:** 60 FPS
- **Scaling:** Auto-detected based on devicePixelRatio

---

## Testing Your Graphics

After creating new graphics:
1. Replace the appropriate PNG file in `/img/` directory
2. Keep the same filename
3. Refresh the browser (hard reload: Cmd+Shift+R)
4. Test both 1x and 2x versions if possible
5. Verify animations look smooth at 60 FPS
6. Check collision detection still works properly

---

## Quick Reference Table

| Graphic | 1x Dimensions | 2x Dimensions | Frames | Type |
|---------|---------------|---------------|--------|------|
| Fremen | 262×47px | 524×94px | 6 | Horizontal sprite sheet |
| Large Cactus | 75×50px | 150×100px | 3 | Horizontal sprite sheet |
| Small Cactus | 51×35px | 102×70px | 3 | Horizontal sprite sheet |
| Cloud | 46×13px | 92×26px | 1 | Static image |
| Horizon | 1200×12px | 2400×24px | 2 | Tiling sprite sheet |
| Restart | 36×32px | 72×64px | 1 | Static image |
| Text | 191×13px | 382×26px | 10+ | Vertical sprite sheet |

---

## Notes for AI Image Generation

If using AI tools like DALL-E or Stable Diffusion:

1. **Request pixel art style** for consistency
2. **Specify transparent background**
3. **Generate at 2x size** then scale down for 1x version
4. **Generate frames separately** then combine into sprite sheet
5. **Keep designs simple** - complex details don't work well at small sizes
6. **Maintain silhouette clarity** - players need to see the character clearly

### Example Prompts:
- "Pixel art running character sprite sheet, 6 frames, transparent background, gray color, minimalist style"
- "Pixel art cactus obstacle, side view, transparent background, gray monochrome"
- "Simple pixel art cloud, transparent background, minimalist style"


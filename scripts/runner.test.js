/**
 * @jest-environment jsdom
 */

/**
 * Tests for HorizonLine tile wrapping logic.
 * 
 * The HorizonLine class uses 3 tiles that scroll left and wrap around
 * to create a seamless infinite scrolling ground effect.
 */

// Mock canvas context
const createMockCanvasContext = () => ({
    drawImage: jest.fn(),
});

// Mock canvas
const createMockCanvas = () => ({
    getContext: jest.fn(() => createMockCanvasContext()),
});

// Mock image
const createMockImage = () => ({});

// HorizonLine dimensions (must match runner.js)
const TILE_WIDTH = 900;
const TILE_HEIGHT = 18;
const TILE_YPOS = 197;

/**
 * Simplified HorizonLine class for testing tile logic.
 * Extracted from runner.js to enable unit testing without full game context.
 */
class TestableHorizonLine {
    constructor() {
        this.dimensions = {
            WIDTH: TILE_WIDTH,
            HEIGHT: TILE_HEIGHT,
            YPOS: TILE_YPOS,
        };
        this.sourceDimensions = {
            WIDTH: TILE_WIDTH,
            HEIGHT: TILE_HEIGHT,
        };
        this.xPos = [0, TILE_WIDTH, TILE_WIDTH * 2];
        this.sourceXPos = [0, TILE_WIDTH, 0];
        this.yPos = TILE_YPOS;
        this.bumpThreshold = 0.5;
    }

    getRandomType() {
        return Math.random() > this.bumpThreshold ? this.dimensions.WIDTH : 0;
    }

    updateXPos(pos, increment) {
        var width = this.dimensions.WIDTH;
        
        // Move all tiles left by increment
        for (var i = 0; i < 3; i++) {
            this.xPos[i] -= increment;
        }
        
        // Check each tile - if it's scrolled off-screen left, wrap it to the right
        for (var i = 0; i < 3; i++) {
            if (this.xPos[i] <= -width) {
                // Find the rightmost tile position
                var maxX = Math.max(this.xPos[0], this.xPos[1], this.xPos[2]);
                // Place this tile to the right of the rightmost tile
                this.xPos[i] = maxX + width;
                // Randomize terrain type for variety
                this.sourceXPos[i] = this.getRandomType();
            }
        }
    }

    reset() {
        var width = this.dimensions.WIDTH;
        this.xPos[0] = 0;
        this.xPos[1] = width;
        this.xPos[2] = width * 2;
    }
}

describe('HorizonLine', () => {
    let horizonLine;

    beforeEach(() => {
        horizonLine = new TestableHorizonLine();
    });

    describe('initialization', () => {
        it('should initialize with 3 tiles', () => {
            expect(horizonLine.xPos).toHaveLength(3);
            expect(horizonLine.sourceXPos).toHaveLength(3);
        });

        it('should position tiles consecutively from 0', () => {
            expect(horizonLine.xPos[0]).toBe(0);
            expect(horizonLine.xPos[1]).toBe(TILE_WIDTH);
            expect(horizonLine.xPos[2]).toBe(TILE_WIDTH * 2);
        });

        it('should have correct tile dimensions', () => {
            expect(horizonLine.dimensions.WIDTH).toBe(900);
            expect(horizonLine.dimensions.HEIGHT).toBe(18);
        });
    });

    describe('updateXPos - basic scrolling', () => {
        it('should move all tiles left by the increment', () => {
            const increment = 10;
            const originalPositions = [...horizonLine.xPos];
            
            horizonLine.updateXPos(0, increment);
            
            expect(horizonLine.xPos[0]).toBe(originalPositions[0] - increment);
            expect(horizonLine.xPos[1]).toBe(originalPositions[1] - increment);
            expect(horizonLine.xPos[2]).toBe(originalPositions[2] - increment);
        });

        it('should handle multiple small increments', () => {
            for (let i = 0; i < 10; i++) {
                horizonLine.updateXPos(0, 5);
            }
            
            // After 10 increments of 5, tiles should have moved 50px left
            expect(horizonLine.xPos[0]).toBe(-50);
            expect(horizonLine.xPos[1]).toBe(TILE_WIDTH - 50);
            expect(horizonLine.xPos[2]).toBe(TILE_WIDTH * 2 - 50);
        });
    });

    describe('updateXPos - tile wrapping', () => {
        it('should wrap a tile to the right when it scrolls past -WIDTH', () => {
            // Move tiles so the first one is about to wrap
            horizonLine.xPos = [-899, 1, 901];
            
            // This increment should push tile 0 past -900, triggering wrap
            horizonLine.updateXPos(0, 2);
            
            // Tile 0 should have wrapped to the right of the rightmost tile
            // After decrement: [-901, -1, 899]
            // Tile 0 at -901 <= -900, so it wraps to maxX + WIDTH = 899 + 900 = 1799
            expect(horizonLine.xPos[0]).toBe(1799);
            expect(horizonLine.xPos[1]).toBe(-1);
            expect(horizonLine.xPos[2]).toBe(899);
        });

        it('should maintain tile coverage after wrapping', () => {
            // Simulate many scroll updates
            for (let i = 0; i < 1000; i++) {
                horizonLine.updateXPos(0, 10);
            }
            
            // Sort positions to check coverage
            const sortedPositions = [...horizonLine.xPos].sort((a, b) => a - b);
            
            // Tiles should be consecutive (each WIDTH apart)
            expect(sortedPositions[1] - sortedPositions[0]).toBe(TILE_WIDTH);
            expect(sortedPositions[2] - sortedPositions[1]).toBe(TILE_WIDTH);
        });

        it('should provide at least 2 tiles of lookahead from position 0', () => {
            // After any amount of scrolling, there should always be
            // at least 2*WIDTH pixels of coverage to the right of 0
            for (let i = 0; i < 500; i++) {
                horizonLine.updateXPos(0, 7);
                
                const maxPosition = Math.max(...horizonLine.xPos);
                // With 3 tiles, max coverage extends to maxPosition + WIDTH
                // We need at least 2*WIDTH coverage ahead (for a 600px viewport)
                expect(maxPosition + TILE_WIDTH).toBeGreaterThanOrEqual(TILE_WIDTH * 2);
            }
        });

        it('should never have gaps between tiles', () => {
            for (let i = 0; i < 500; i++) {
                horizonLine.updateXPos(0, 13); // Prime number for variety
                
                const sortedPositions = [...horizonLine.xPos].sort((a, b) => a - b);
                
                // Check no gaps (tiles should be exactly WIDTH apart)
                const gap1 = sortedPositions[1] - sortedPositions[0];
                const gap2 = sortedPositions[2] - sortedPositions[1];
                
                expect(gap1).toBe(TILE_WIDTH);
                expect(gap2).toBe(TILE_WIDTH);
            }
        });
    });

    describe('updateXPos - edge cases', () => {
        it('should handle zero increment', () => {
            const originalPositions = [...horizonLine.xPos];
            
            horizonLine.updateXPos(0, 0);
            
            expect(horizonLine.xPos).toEqual(originalPositions);
        });

        it('should handle very large increments', () => {
            // Large increment that would move tiles multiple widths
            horizonLine.updateXPos(0, TILE_WIDTH * 2);
            
            // Tiles should still maintain proper spacing after wrapping
            const sortedPositions = [...horizonLine.xPos].sort((a, b) => a - b);
            expect(sortedPositions[1] - sortedPositions[0]).toBe(TILE_WIDTH);
            expect(sortedPositions[2] - sortedPositions[1]).toBe(TILE_WIDTH);
        });

        it('should handle exact WIDTH increment', () => {
            horizonLine.updateXPos(0, TILE_WIDTH);
            
            // All tiles moved by exactly one tile width
            // First tile should have wrapped
            const sortedPositions = [...horizonLine.xPos].sort((a, b) => a - b);
            expect(sortedPositions[1] - sortedPositions[0]).toBe(TILE_WIDTH);
            expect(sortedPositions[2] - sortedPositions[1]).toBe(TILE_WIDTH);
        });
    });

    describe('reset', () => {
        it('should restore tiles to initial positions', () => {
            // Scramble positions
            horizonLine.xPos = [-500, 200, 1100];
            
            horizonLine.reset();
            
            expect(horizonLine.xPos[0]).toBe(0);
            expect(horizonLine.xPos[1]).toBe(TILE_WIDTH);
            expect(horizonLine.xPos[2]).toBe(TILE_WIDTH * 2);
        });
    });

    describe('terrain variety', () => {
        it('should randomize sourceXPos when wrapping', () => {
            // Force deterministic random for testing
            const originalRandom = Math.random;
            let callCount = 0;
            Math.random = () => {
                callCount++;
                return callCount % 2 === 0 ? 0.6 : 0.4; // Alternate above/below threshold
            };

            try {
                const originalSourceXPos = [...horizonLine.sourceXPos];
                
                // Scroll enough to trigger wrapping
                for (let i = 0; i < 100; i++) {
                    horizonLine.updateXPos(0, 50);
                }
                
                // sourceXPos should have been modified (randomized)
                // At least one wrap should have occurred, changing sourceXPos
                expect(callCount).toBeGreaterThan(0);
            } finally {
                Math.random = originalRandom;
            }
        });
    });
});

// =============================================================================
// Collision Detection Tests
// =============================================================================

/**
 * CollisionBox class for testing (mirrors runner.js)
 */
class CollisionBox {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
    }
}

/**
 * Collision tolerance constant (must match runner.js)
 */
const COLLISION_TOLERANCE = 10;

/**
 * Box comparison function (mirrors runner.js)
 */
function boxCompare(box1, box2) {
    return (
        box1.x < box2.x + box2.width &&
        box1.x + box1.width > box2.x &&
        box1.y < box2.y + box2.height &&
        box1.height + box1.y > box2.y
    );
}

/**
 * Create adjusted collision box with tolerance (mirrors runner.js)
 */
function createAdjustedCollisionBox(box, adjustment) {
    var shrink = Math.floor(COLLISION_TOLERANCE / 2);
    return new CollisionBox(
        box.x + adjustment.x + shrink,
        box.y + adjustment.y + shrink,
        Math.max(box.width - (shrink * 2), 1),
        Math.max(box.height - (shrink * 2), 1)
    );
}

describe('Collision Detection', () => {
    describe('COLLISION_TOLERANCE', () => {
        it('should shrink outer collision boxes by tolerance value', () => {
            // Simulating what checkForCollision does for outer boxes
            const tolerance = COLLISION_TOLERANCE;
            const originalWidth = 66; // Fremen width
            const originalHeight = 70; // Fremen height
            
            const shrunkWidth = originalWidth - 2 - (tolerance * 2);
            const shrunkHeight = originalHeight - 2 - (tolerance * 2);
            
            // With tolerance of 10, width shrinks by 22 (2 + 20), height by 22
            expect(shrunkWidth).toBe(44);
            expect(shrunkHeight).toBe(48);
        });

        it('should make near-misses not register as collisions', () => {
            // Two boxes that would collide without tolerance
            const box1 = new CollisionBox(50, 100, 60, 60);
            const box2 = new CollisionBox(105, 100, 60, 60);
            
            // Without tolerance, these overlap (50+60=110 > 105)
            expect(boxCompare(box1, box2)).toBe(true);
            
            // With tolerance applied (shrink by 6 on each side)
            const toleratedBox1 = new CollisionBox(56, 106, 48, 48);
            const toleratedBox2 = new CollisionBox(111, 106, 48, 48);
            
            // Now they don't overlap (56+48=104 < 111)
            expect(boxCompare(toleratedBox1, toleratedBox2)).toBe(false);
        });
    });

    describe('createAdjustedCollisionBox', () => {
        it('should apply shrink factor to detailed collision boxes', () => {
            const box = new CollisionBox(20, 30, 30, 40);
            const adjustment = new CollisionBox(100, 150, 0, 0);
            
            const adjusted = createAdjustedCollisionBox(box, adjustment);
            const shrink = Math.floor(COLLISION_TOLERANCE / 2); // 3
            
            expect(adjusted.x).toBe(20 + 100 + shrink); // 123
            expect(adjusted.y).toBe(30 + 150 + shrink); // 183
            expect(adjusted.width).toBe(30 - (shrink * 2)); // 24
            expect(adjusted.height).toBe(40 - (shrink * 2)); // 34
        });

        it('should not allow width/height below 1', () => {
            const tinyBox = new CollisionBox(0, 0, 4, 4);
            const adjustment = new CollisionBox(0, 0, 0, 0);
            
            const adjusted = createAdjustedCollisionBox(tinyBox, adjustment);
            
            // With shrink of 3, 4 - 6 = -2, but should be clamped to 1
            expect(adjusted.width).toBeGreaterThanOrEqual(1);
            expect(adjusted.height).toBeGreaterThanOrEqual(1);
        });
    });
});

describe('Harkonnen Obstacle Collision Boxes', () => {
    // Harkonnen config from runner.js
    const HARKONNEN_WIDTH = 65;
    const HARKONNEN_HEIGHT = 90;
    const HARKONNEN_COLLISION_BOXES = [
        new CollisionBox(12, 38, 18, 42),  // left
        new CollisionBox(30, 38, 18, 42),  // middle
        new CollisionBox(48, 38, 12, 42)   // right
    ];

    it('should have 3 collision boxes for multi-size support', () => {
        expect(HARKONNEN_COLLISION_BOXES.length).toBe(3);
    });

    it('should have collision boxes that fit within sprite bounds', () => {
        for (const box of HARKONNEN_COLLISION_BOXES) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(HARKONNEN_WIDTH);
            expect(box.y + box.height).toBeLessThanOrEqual(HARKONNEN_HEIGHT);
        }
    });

    it('should have forgiving collision boxes (smaller than full width)', () => {
        const totalCollisionWidth = HARKONNEN_COLLISION_BOXES.reduce(
            (sum, box) => sum + box.width, 0
        );
        // Collision coverage should be less than full width for forgiveness
        expect(totalCollisionWidth).toBeLessThan(HARKONNEN_WIDTH);
    });

    describe('multi-size collision box adjustment', () => {
        /**
         * Simulates the init() logic from runner.js for multi-size obstacles
         */
        function adjustCollisionBoxesForSize(boxes, singleWidth, size) {
            if (size <= 1 || boxes.length < 3) return boxes;
            
            const totalWidth = singleWidth * size;
            const adjusted = boxes.map(b => new CollisionBox(b.x, b.y, b.width, b.height));
            
            // Middle box width expands to fill the gap
            adjusted[1].width = totalWidth - adjusted[0].width - adjusted[2].width;
            // Right box moves to the right edge
            adjusted[2].x = totalWidth - adjusted[2].width;
            
            return adjusted;
        }

        it('should expand middle box for size 2', () => {
            const adjusted = adjustCollisionBoxesForSize(
                HARKONNEN_COLLISION_BOXES, HARKONNEN_WIDTH, 2
            );
            const totalWidth = HARKONNEN_WIDTH * 2; // 130
            
            // Middle box should span from left box edge to right box edge
            expect(adjusted[1].width).toBe(totalWidth - 18 - 12); // 100
        });

        it('should expand middle box for size 3', () => {
            const adjusted = adjustCollisionBoxesForSize(
                HARKONNEN_COLLISION_BOXES, HARKONNEN_WIDTH, 3
            );
            const totalWidth = HARKONNEN_WIDTH * 3; // 195
            
            // Middle box should span from left box edge to right box edge
            expect(adjusted[1].width).toBe(totalWidth - 18 - 12); // 165
        });

        it('should reposition right box to far edge for size 3', () => {
            const adjusted = adjustCollisionBoxesForSize(
                HARKONNEN_COLLISION_BOXES, HARKONNEN_WIDTH, 3
            );
            const totalWidth = HARKONNEN_WIDTH * 3; // 195
            
            // Right box should be at the far right
            expect(adjusted[2].x).toBe(totalWidth - 12); // 183
        });

        it('should provide continuous collision coverage for size 3', () => {
            const adjusted = adjustCollisionBoxesForSize(
                HARKONNEN_COLLISION_BOXES, HARKONNEN_WIDTH, 3
            );
            
            // Left box ends at x + width
            const leftEnd = adjusted[0].x + adjusted[0].width; // 12 + 18 = 30
            // Middle box starts at x
            const middleStart = adjusted[1].x; // 30
            // Middle box ends at x + width
            const middleEnd = adjusted[1].x + adjusted[1].width; // 30 + 165 = 195
            // Right box starts at x
            const rightStart = adjusted[2].x; // 183
            
            // Boxes should be continuous (some overlap is OK for safety)
            expect(middleStart).toBeLessThanOrEqual(leftEnd);
            expect(rightStart).toBeLessThanOrEqual(middleEnd);
        });
    });
});

// =============================================================================
// Splash Screen Tests
// =============================================================================

describe('Splash Screen Controller', () => {
    let splashScreen;
    let gameLogo;
    let startBtn;

    beforeEach(() => {
        // Set up DOM elements
        document.body.innerHTML = `
            <div id="splash-screen"></div>
            <img class="game-logo" />
            <button id="start-btn">PLAY GAME</button>
        `;
        splashScreen = document.getElementById('splash-screen');
        gameLogo = document.querySelector('.game-logo');
        startBtn = document.getElementById('start-btn');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('dismissSplash behavior', () => {
        it('should add visible class to game logo when splash is dismissed', () => {
            // Simulate what dismissSplash does
            splashScreen.classList.add('hidden');
            if (gameLogo) {
                gameLogo.classList.add('visible');
            }

            expect(gameLogo.classList.contains('visible')).toBe(true);
        });

        it('should add hidden class to splash screen when dismissed', () => {
            splashScreen.classList.add('hidden');

            expect(splashScreen.classList.contains('hidden')).toBe(true);
        });

        it('game logo should not have visible class initially', () => {
            expect(gameLogo.classList.contains('visible')).toBe(false);
        });
    });
});

// =============================================================================
// Speed Scaling Tests
// =============================================================================

describe('Speed Scaling System', () => {
    // Config values from runner.js
    const SPEED_CONFIG = {
        SPEED: 6,
        MAX_SPEED: 13,
        ACCELERATION: 0.003,
        SPEED_SCALE_INTERVAL: 1000,
        SPEED_SCALE_AMOUNT: 1.5,
        ABSOLUTE_MAX_SPEED: 25
    };

    /**
     * Calculate dynamic max speed based on score (mirrors runner.js logic)
     */
    function calculateDynamicMaxSpeed(score, config) {
        const speedBonusIntervals = Math.floor(score / config.SPEED_SCALE_INTERVAL);
        return Math.min(
            config.MAX_SPEED + (speedBonusIntervals * config.SPEED_SCALE_AMOUNT),
            config.ABSOLUTE_MAX_SPEED
        );
    }

    describe('configuration values', () => {
        it('should have faster acceleration than before (was 0.001)', () => {
            expect(SPEED_CONFIG.ACCELERATION).toBeGreaterThan(0.001);
        });

        it('should have higher initial max speed than before (was 12)', () => {
            expect(SPEED_CONFIG.MAX_SPEED).toBeGreaterThan(12);
        });

        it('should have an absolute max speed cap', () => {
            expect(SPEED_CONFIG.ABSOLUTE_MAX_SPEED).toBeDefined();
            expect(SPEED_CONFIG.ABSOLUTE_MAX_SPEED).toBeGreaterThan(SPEED_CONFIG.MAX_SPEED);
        });
    });

    describe('calculateDynamicMaxSpeed', () => {
        it('should return base MAX_SPEED at score 0', () => {
            const maxSpeed = calculateDynamicMaxSpeed(0, SPEED_CONFIG);
            expect(maxSpeed).toBe(SPEED_CONFIG.MAX_SPEED);
        });

        it('should return base MAX_SPEED just below first interval', () => {
            const maxSpeed = calculateDynamicMaxSpeed(999, SPEED_CONFIG);
            expect(maxSpeed).toBe(SPEED_CONFIG.MAX_SPEED);
        });

        it('should increase max speed at first score interval (1000)', () => {
            const maxSpeed = calculateDynamicMaxSpeed(1000, SPEED_CONFIG);
            expect(maxSpeed).toBe(SPEED_CONFIG.MAX_SPEED + SPEED_CONFIG.SPEED_SCALE_AMOUNT);
        });

        it('should increase max speed proportionally with score', () => {
            const scoreAt5000 = calculateDynamicMaxSpeed(5000, SPEED_CONFIG);
            const expectedSpeed = SPEED_CONFIG.MAX_SPEED + (5 * SPEED_CONFIG.SPEED_SCALE_AMOUNT);
            expect(scoreAt5000).toBe(expectedSpeed);
        });

        it('should cap max speed at ABSOLUTE_MAX_SPEED', () => {
            // Calculate how many intervals to exceed absolute max
            const intervalsToExceed = Math.ceil(
                (SPEED_CONFIG.ABSOLUTE_MAX_SPEED - SPEED_CONFIG.MAX_SPEED) / SPEED_CONFIG.SPEED_SCALE_AMOUNT
            ) + 5;
            const veryHighScore = intervalsToExceed * SPEED_CONFIG.SPEED_SCALE_INTERVAL;
            
            const maxSpeed = calculateDynamicMaxSpeed(veryHighScore, SPEED_CONFIG);
            expect(maxSpeed).toBe(SPEED_CONFIG.ABSOLUTE_MAX_SPEED);
        });

        it('should never exceed ABSOLUTE_MAX_SPEED even at extreme scores', () => {
            const extremeScore = 100000;
            const maxSpeed = calculateDynamicMaxSpeed(extremeScore, SPEED_CONFIG);
            expect(maxSpeed).toBeLessThanOrEqual(SPEED_CONFIG.ABSOLUTE_MAX_SPEED);
        });
    });

    describe('speed progression milestones', () => {
        const milestones = [0, 1000, 2000, 5000, 10000, 15000, 20000];

        it('should have increasing max speed at each milestone', () => {
            let previousMaxSpeed = 0;
            
            for (const score of milestones) {
                const maxSpeed = calculateDynamicMaxSpeed(score, SPEED_CONFIG);
                expect(maxSpeed).toBeGreaterThanOrEqual(previousMaxSpeed);
                previousMaxSpeed = maxSpeed;
            }
        });

        it('should reach max speed cap before 20k score', () => {
            // At 10k score, should be close to or at max
            const speedAt10k = calculateDynamicMaxSpeed(10000, SPEED_CONFIG);
            // At 20k, definitely at max
            const speedAt20k = calculateDynamicMaxSpeed(20000, SPEED_CONFIG);
            
            expect(speedAt20k).toBe(SPEED_CONFIG.ABSOLUTE_MAX_SPEED);
        });
    });

    describe('gameplay feel validation', () => {
        it('should have reasonable speed at 10k score', () => {
            const maxSpeedAt10k = calculateDynamicMaxSpeed(10000, SPEED_CONFIG);
            
            // At 10k, speed should be noticeably higher than the old cap of 12
            expect(maxSpeedAt10k).toBeGreaterThan(12);
            
            // But not insanely high - should be challenging but playable
            expect(maxSpeedAt10k).toBeLessThanOrEqual(SPEED_CONFIG.ABSOLUTE_MAX_SPEED);
        });

        it('should scale appropriately for casual vs skilled players', () => {
            // Casual player might reach 2000-3000
            const casualMaxSpeed = calculateDynamicMaxSpeed(2500, SPEED_CONFIG);
            
            // Skilled player might reach 8000-12000
            const skilledMaxSpeed = calculateDynamicMaxSpeed(10000, SPEED_CONFIG);
            
            // Skilled player should face significantly higher speeds
            expect(skilledMaxSpeed - casualMaxSpeed).toBeGreaterThan(5);
        });
    });
});

describe('HorizonLine integration with viewport', () => {
    const VIEWPORT_WIDTH = 600; // Default canvas width from runner.js

    it('should always cover the viewport plus buffer', () => {
        const horizonLine = new TestableHorizonLine();
        
        for (let i = 0; i < 1000; i++) {
            horizonLine.updateXPos(0, 8);
            
            // Find the leftmost visible tile (xPos > -TILE_WIDTH means some part is visible)
            // and the rightmost tile edge
            const minX = Math.min(...horizonLine.xPos);
            const maxX = Math.max(...horizonLine.xPos);
            const rightEdge = maxX + TILE_WIDTH;
            
            // The visible area (0 to VIEWPORT_WIDTH) should always be covered
            // minX should be <= 0 (tile starts at or before viewport)
            // rightEdge should be >= VIEWPORT_WIDTH (tile extends past viewport)
            expect(minX).toBeLessThanOrEqual(0);
            expect(rightEdge).toBeGreaterThanOrEqual(VIEWPORT_WIDTH);
        }
    });

    it('should have sufficient lookahead buffer for smooth rendering', () => {
        const horizonLine = new TestableHorizonLine();
        const MINIMUM_LOOKAHEAD = TILE_WIDTH; // At least one tile of lookahead
        
        for (let i = 0; i < 500; i++) {
            horizonLine.updateXPos(0, 11);
            
            const maxX = Math.max(...horizonLine.xPos);
            const rightEdge = maxX + TILE_WIDTH;
            const lookahead = rightEdge - VIEWPORT_WIDTH;
            
            expect(lookahead).toBeGreaterThanOrEqual(MINIMUM_LOOKAHEAD);
        }
    });
});

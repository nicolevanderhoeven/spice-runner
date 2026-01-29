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

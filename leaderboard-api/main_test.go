package main

import (
	"fmt"
	"testing"
)

func TestCacheKeyPlayerRank(t *testing.T) {
	got := fmt.Sprintf(cacheKeyPlayerRank, 1234)
	want := "leaderboard:player:1234:rank"
	if got != want {
		t.Errorf("rank cache key = %q, want %q", got, want)
	}
}

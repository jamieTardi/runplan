/**
 * Stick-figure pose data for the strength-exercise illustrations.
 *
 * Every exercise is drawn by the same renderer (ExerciseFigure) from one or
 * two poses, which keeps all illustrations visually identical in style. A
 * pose is a head position plus named polyline "parts" (torso, limbs) in a
 * shared 120×90 viewBox with the ground line at y=80. Exercises with a
 * second pose animate smoothly between the two (a slow two-frame loop);
 * single-pose exercises are isometric holds and stay static.
 *
 * Conventions:
 *  - Figures face right, side view.
 *  - Part names ending in "B" are the far-side limb and render fainter.
 *  - A part must have the same point count in both poses (the SVG `d`
 *    animation interpolates point-for-point) — enforced by unit test.
 */

export type Point = [number, number];

export interface Pose {
  head: Point;
  parts: Record<string, Point[]>;
}

export interface ExerciseArt {
  poseA: Pose;
  poseB?: Pose;
}

// prettier-ignore
export const EXERCISE_ART: Record<string, ExerciseArt> = JSON.parse(`
{
  "squat": {
    "poseA": {
      "head": [57, 14],
      "parts": {
        "legB": [[58, 44], [55, 61], [54, 78], [63, 78]],
        "torso": [[56, 23], [58, 44]],
        "legF": [[58, 44], [59, 61], [58, 78], [67, 78]],
        "armF": [[56, 23], [66, 26], [76, 28]]
      }
    },
    "poseB": {
      "head": [63, 34],
      "parts": {
        "legB": [[50, 62], [66, 68], [54, 78], [63, 78]],
        "torso": [[60, 42], [50, 62]],
        "legF": [[50, 62], [70, 66], [58, 78], [67, 78]],
        "armF": [[60, 42], [70, 44], [80, 45]]
      }
    }
  },
  "walking-lunge": {
    "poseA": {
      "head": [58, 26],
      "parts": {
        "legB": [[58, 56], [46, 68], [33, 72], [28, 77]],
        "torso": [[58, 35], [58, 56]],
        "legF": [[58, 56], [74, 58], [74, 76], [82, 77]],
        "armF": [[58, 35], [64, 44], [59, 50]]
      }
    },
    "poseB": {
      "head": [58, 20],
      "parts": {
        "legB": [[58, 50], [47, 63], [33, 68], [28, 77]],
        "torso": [[58, 29], [58, 50]],
        "legF": [[58, 50], [73, 56], [74, 76], [82, 77]],
        "armF": [[58, 29], [64, 38], [59, 44]]
      }
    }
  },
  "single-leg-calf-raise": {
    "poseA": {
      "head": [58, 14],
      "parts": {
        "legB": [[58, 42], [54, 58], [45, 64]],
        "torso": [[58, 23], [58, 42]],
        "legF": [[58, 42], [58, 58], [58, 74], [66, 78]],
        "footF": [[58, 74], [53, 78]],
        "armF": [[58, 23], [62, 33], [64, 42]]
      }
    },
    "poseB": {
      "head": [58, 8],
      "parts": {
        "legB": [[58, 36], [54, 52], [45, 58]],
        "torso": [[58, 17], [58, 36]],
        "legF": [[58, 36], [58, 52], [60, 68], [66, 78]],
        "footF": [[60, 68], [56, 73]],
        "armF": [[58, 17], [62, 27], [64, 36]]
      }
    }
  },
  "glute-bridge": {
    "poseA": {
      "head": [24, 71],
      "parts": {
        "torso": [[32, 72], [52, 72]],
        "legF": [[52, 72], [64, 58], [70, 74], [78, 75]],
        "armF": [[32, 72], [41, 75], [50, 76]]
      }
    },
    "poseB": {
      "head": [24, 71],
      "parts": {
        "torso": [[32, 72], [46, 58]],
        "legF": [[46, 58], [64, 57], [70, 74], [78, 75]],
        "armF": [[32, 72], [41, 75], [50, 76]]
      }
    }
  },
  "plank": {
    "poseA": {
      "head": [33, 55],
      "parts": {
        "torso": [[40, 61], [63, 66]],
        "legF": [[63, 66], [78, 69], [92, 73], [97, 78]],
        "armF": [[40, 61], [36, 78], [48, 78]]
      }
    }
  },
  "side-plank": {
    "poseA": {
      "head": [36, 47],
      "parts": {
        "torso": [[42, 53], [64, 62]],
        "legF": [[64, 62], [78, 68], [92, 74], [97, 78]],
        "armUp": [[42, 53], [44, 43], [46, 33]],
        "armF": [[42, 53], [38, 76], [50, 76]]
      }
    }
  },
  "dead-bug": {
    "poseA": {
      "head": [27, 71],
      "parts": {
        "legB": [[58, 72], [63, 57], [77, 58]],
        "armB": [[36, 72], [39, 62], [38, 52]],
        "torso": [[36, 72], [58, 72]],
        "legF": [[58, 72], [61, 56], [75, 57]],
        "armF": [[36, 72], [37, 62], [36, 52]]
      }
    },
    "poseB": {
      "head": [27, 71],
      "parts": {
        "legB": [[58, 72], [63, 57], [77, 58]],
        "armB": [[36, 72], [39, 62], [38, 52]],
        "torso": [[36, 72], [58, 72]],
        "legF": [[58, 72], [73, 62], [89, 66]],
        "armF": [[36, 72], [27, 65], [18, 58]]
      }
    }
  },
  "single-leg-glute-bridge": {
    "poseA": {
      "head": [24, 71],
      "parts": {
        "torso": [[32, 72], [52, 72]],
        "legF": [[52, 72], [64, 58], [70, 74], [78, 75]],
        "legUp": [[52, 72], [63, 63], [74, 54]],
        "armF": [[32, 72], [41, 75], [50, 76]]
      }
    },
    "poseB": {
      "head": [24, 71],
      "parts": {
        "torso": [[32, 72], [46, 58]],
        "legF": [[46, 58], [64, 57], [70, 74], [78, 75]],
        "legUp": [[46, 58], [57, 49], [68, 40]],
        "armF": [[32, 72], [41, 75], [50, 76]]
      }
    }
  }
}
`);

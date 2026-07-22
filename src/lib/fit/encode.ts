import "server-only";
import { Encoder, Profile } from "@garmin/fitsdk";
import type { FileIdMesg, WorkoutMesg, WorkoutStepMesg } from "@garmin/fitsdk";
import type { FitPlanItem } from "./steps";

// FIT wire scales (the JS SDK encoder takes raw values).
const DISTANCE_SCALE = 100; // metres → cm
const TIME_SCALE = 1000; // seconds → ms
const SPEED_SCALE = 1000; // m/s → mm/s

function paceToRawSpeed(paceSPerKm: number): number {
  return Math.round((1000 / paceSPerKm) * SPEED_SCALE);
}

/** Encode a step list into a .fit structured-workout file. */
export function encodeWorkoutFit(name: string, items: FitPlanItem[]): Uint8Array {
  const encoder = new Encoder();

  const fileId: FileIdMesg = {
    type: "workout",
    manufacturer: "development",
    product: 0,
    timeCreated: new Date(),
    serialNumber: Math.floor(Date.now() / 1000),
  };
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileId);

  const workout: WorkoutMesg = {
    // Garmin devices truncate long names; keep it readable on a watch face.
    wktName: name.slice(0, 40),
    sport: "running",
    numValidSteps: items.length,
  };
  encoder.onMesg(Profile.MesgNum.WORKOUT, workout);

  items.forEach((item, index) => {
    if (item.kind === "repeat") {
      const repeat: WorkoutStepMesg = {
        messageIndex: index,
        durationType: "repeatUntilStepsCmplt",
        durationValue: item.fromIndex,
        targetType: "open",
        targetValue: item.count,
      };
      encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, repeat);
      return;
    }

    const mesg: WorkoutStepMesg = {
      messageIndex: index,
      wktStepName: item.name.slice(0, 50),
      intensity: item.intensity,
    };

    if (item.durationM != null) {
      mesg.durationType = "distance";
      mesg.durationValue = Math.round(item.durationM * DISTANCE_SCALE);
    } else if (item.durationS != null) {
      mesg.durationType = "time";
      mesg.durationValue = Math.round(item.durationS * TIME_SCALE);
    } else {
      mesg.durationType = "open"; // advance on lap press
    }

    if (item.paceFastSPerKm != null && item.paceSlowSPerKm != null) {
      mesg.targetType = "speed";
      mesg.targetValue = 0; // 0 = custom range below
      // Low speed bound = the slower pace, high = the faster.
      mesg.customTargetValueLow = paceToRawSpeed(item.paceSlowSPerKm);
      mesg.customTargetValueHigh = paceToRawSpeed(item.paceFastSPerKm);
    } else {
      mesg.targetType = "open";
    }

    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, mesg);
  });

  return encoder.close();
}

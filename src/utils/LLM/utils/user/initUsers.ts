import alinaUser from "./userPrompts/alina";
import almeUser from "./userPrompts/alme";
import danielUser from "./userPrompts/daniel";
import dennisUser from "./userPrompts/dennis";
import heikoUser from "./userPrompts/heiko";
import jasonUser from "./userPrompts/jason";
import joshiUser from "./userPrompts/joshi";
import karlUser from "./userPrompts/karl";
import katrinUser from "./userPrompts/katrin";
import larsUser from "./userPrompts/lars";
import lukasUser from "./userPrompts/lukas";
import sergejUser from "./userPrompts/sergej";
import tilUser from "./userPrompts/til";
import tomUser from "./userPrompts/tom";

export const users = [
  alinaUser,
  almeUser,
  danielUser,
  dennisUser,
  heikoUser,
  jasonUser,
  joshiUser,
  karlUser,
  katrinUser,
  larsUser,
  lukasUser,
  sergejUser,
  tilUser,
  tomUser,
];

export function initUsers() {
  // Users are now statically defined - no JSON persistence needed.
  // Message history is handled by the vector DB.
}

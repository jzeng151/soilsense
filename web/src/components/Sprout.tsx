// Sprout, the Soil Sense mascot (from the brand kit: "Sprout, six moods").
// Each mood has one job in the product; use the matching one, never decorate with a random mood.
import { useI18n } from "../i18n";
import hello from "../assets/sprout/hello.svg";
import checking from "../assets/sprout/checking.svg";
import onCall from "../assets/sprout/on-call.svg";
import cropMatch from "../assets/sprout/crop-match.svg";
import weatherAlert from "../assets/sprout/weather-alert.svg";
import resting from "../assets/sprout/resting.svg";

export type SproutMood = "hello" | "checking" | "on-call" | "crop-match" | "weather-alert" | "resting";

const MOODS: Record<SproutMood, { src: string; alt: string }> = {
  hello: { src: hello, alt: "Sprout waving hello" }, // greeting, first visit, first SMS
  checking: { src: checking, alt: "Sprout thinking while the NASA data loads" }, // loading / hold
  "on-call": { src: onCall, alt: "Sprout holding a phone" }, // call in progress
  "crop-match": { src: cropMatch, alt: "Sprout cheering: a crop plan is ready" }, // recommendation ready
  "weather-alert": { src: weatherAlert, alt: "Sprout looking worried about the weather" }, // flood or drought warning
  resting: { src: resting, alt: "Sprout sleeping while the field rests" }, // fallow period
};

/** Sprout at a given width (height follows the 150×196 artwork). Pass decorative when text already says the same thing. */
export function Sprout({ mood, width = 120, decorative = false, className = "" }: { mood: SproutMood; width?: number; decorative?: boolean; className?: string }) {
  const { text: localize } = useI18n();
  const m = MOODS[mood];
  return <img className={`sprout ${className}`} src={m.src} width={width} height={Math.round((width * 196) / 150)} alt={decorative ? "" : localize(m.alt)} aria-hidden={decorative || undefined} />;
}

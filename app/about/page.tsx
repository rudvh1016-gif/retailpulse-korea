import { permanentRedirect } from "next/navigation";

// Preserve discovery of the old unlocalized introduction URL
export default function LegacyAboutPage() {
  permanentRedirect("/ko/about");
}

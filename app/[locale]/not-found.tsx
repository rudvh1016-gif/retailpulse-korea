import type { Metadata } from "next";
import NotFoundView from "../not-found";

export const metadata: Metadata = {
  title: "Page not found | KORETAIL",
  robots: { index: false, follow: true },
};

export default NotFoundView;

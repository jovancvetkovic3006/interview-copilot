import { redirect } from "next/navigation";

/**
 * The collaborative interview lobby is the canonical entry point.
 * `/` always sends the user there.
 */
export default function Home() {
  redirect("/interview");
}

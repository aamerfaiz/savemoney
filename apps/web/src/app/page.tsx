import { redirect } from "next/navigation";

export default function Home() {
  // The dashboard is the app's home; middleware handles auth once configured.
  redirect("/dashboard");
}

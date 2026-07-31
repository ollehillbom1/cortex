import { Suspense } from "react";
import { SessionRunner } from "@/components/session/SessionRunner";

export const metadata = { title: "Training session" };

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionRunner />
    </Suspense>
  );
}

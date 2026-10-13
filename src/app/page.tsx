import PublicForm from "@/components/PublicForm";
// The HTML shell contains no customer data or authentication tokens.
// Dynamic rendering lets Next attach the request-specific CSP nonce.
export const dynamic = "force-dynamic";
export default function Page() {
  return <PublicForm />;
}

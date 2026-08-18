import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRequestForm } from "./data-request-form";

// Data deletion request admin tool (Requirement 10.4 / Task 10.4).
export default function DataRequestsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Data Deletion Requests</h1>
      <Card>
        <CardHeader>
          <CardTitle>Delete personal data by identity</CardTitle>
        </CardHeader>
        <CardContent>
          <DataRequestForm />
        </CardContent>
      </Card>
    </div>
  );
}

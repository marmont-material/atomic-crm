import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChaseTab } from "./ChaseTab";
import { SendListTab } from "./SendListTab";
import { TestAddressesTab } from "./TestAddressesTab";
import { useOutreachData } from "./useOutreachData";

export const OutreachPage = () => {
  const { data, error, reload } = useOutreachData();
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Outreach</h1>
      {error && <p className="text-red-600">Could not load: {error}</p>}
      {!data && !error && <p className="text-muted-foreground">Loading...</p>}
      {data && (
        <Tabs defaultValue="send">
          <TabsList>
            <TabsTrigger value="send">Send list</TabsTrigger>
            <TabsTrigger value="test">Test addresses</TabsTrigger>
            <TabsTrigger value="chase">Chase</TabsTrigger>
          </TabsList>
          <TabsContent value="send">
            <SendListTab data={data} reload={reload} />
          </TabsContent>
          <TabsContent value="test">
            <TestAddressesTab data={data} reload={reload} />
          </TabsContent>
          <TabsContent value="chase">
            <ChaseTab data={data} reload={reload} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

OutreachPage.path = "/outreach";

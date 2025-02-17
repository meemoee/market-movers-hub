
import { useEffect, useState } from "react";
import TopMoversList from "@/components/TopMoversList";
import AccountIsland from "@/components/AccountIsland";
import { useParams } from "react-router-dom";

export default function Account() {
  const { userId } = useParams();
  const [pageTitle, setPageTitle] = useState("Account");

  useEffect(() => {
    // Update the page title
    document.title = pageTitle;
  }, [pageTitle]);

  return (
    <div className="flex flex-col lg:flex-row w-full max-w-7xl mx-auto gap-6 p-4">
      <div className="flex-1 min-w-0">
        <div className="sticky top-0 z-40 backdrop-blur-sm bg-background/95 border-b mb-6">
          <div className="flex items-center h-[60px] px-4">
            <h1 className="text-xl font-bold">Account</h1>
          </div>
        </div>
        <AccountActivityList userId={userId} />
      </div>
      <div className="w-full lg:w-[400px]">
        <AccountIsland />
      </div>
    </div>
  );
}


import { Drawer, DrawerContent, DrawerClose } from "@/components/ui/drawer";
import { X } from "lucide-react";
import AccountIsland from "@/components/AccountIsland";

interface MobileAccountDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileAccountDrawer({ open, onOpenChange }: MobileAccountDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] overflow-auto">
        <div className="p-4 max-w-md mx-auto relative">
          <DrawerClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DrawerClose>
          <AccountIsland />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

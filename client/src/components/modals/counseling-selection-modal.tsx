import { useState, useEffect } from "react";
import { useCounseling } from "@/hooks/useCounseling";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { GraduationCap, Loader2 } from "lucide-react";

export function CounselingSelectionModal() {
  const { 
    titles, 
    activeTitle, 
    setActiveTitleId, 
    isLoadingTitles,
    activeSession 
  } = useCounseling();
  
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    // If we've finished loading and there's no active title selected
    // but we have a valid session and titles exist, show the mandatory modal
    if (!isLoadingTitles && !activeTitle && activeSession && titles.length > 0) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [isLoadingTitles, activeTitle, activeSession, titles]);

  const handleContinue = () => {
    if (selectedId) {
      setActiveTitleId(selectedId);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md [&>button]:hidden sm:rounded-xl">
        <DialogHeader className="flex flex-col items-center pt-4 pb-2">
          <div className="bg-primary/10 p-4 rounded-full mb-4">
            <GraduationCap className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-xl font-semibold text-center">
            Select Counseling Title
          </DialogTitle>
          <DialogDescription className="text-center pt-2">
            Please select the counseling title you want to manage. this will be set as your default context.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4 py-4 px-2">
          {isLoadingTitles ? (
            <div className="flex items-center justify-center space-x-2 text-sm text-slate-500 py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading titles...</span>
            </div>
          ) : titles.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-4">
              No titles available for the current session.
            </div>
          ) : (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder="Choose a counseling title..." />
              </SelectTrigger>
              <SelectContent>
                {titles.map((title) => (
                  <SelectItem key={title.id} value={title.id}>
                    {title.displayName || title.titleName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button 
            className="w-full font-medium" 
            onClick={handleContinue}
            disabled={!selectedId || isLoadingTitles || titles.length === 0}
          >
            Continue to Dashboard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

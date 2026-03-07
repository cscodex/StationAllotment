import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FlowDiagramModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function FlowDiagramModal({ isOpen, onClose }: FlowDiagramModalProps) {
    const pdfUrl = "/counseling_flow_diagram.pdf";

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-4">
                <DialogHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <DialogTitle className="text-xl">Counseling Process Flow</DialogTitle>
                        <DialogDescription>
                            Complete workflow for Central Admin & District Admin roles
                        </DialogDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm" onClick={() => window.open(pdfUrl, '_blank')}>
                            <Maximize2 className="w-4 h-4 mr-2" />
                            Open PDF in New Tab
                        </Button>
                        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 w-full bg-white rounded-md border overflow-hidden mt-2 relative">
                    <object
                        data={pdfUrl}
                        type="application/pdf"
                        className="w-full h-full border-0 absolute inset-0"
                    >
                        <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                            <p className="text-muted-foreground mb-4">It looks like the PDF diagram hasn't been uploaded yet, or your browser doesn't support embedded PDFs.</p>
                            <Button onClick={() => window.open(pdfUrl, '_blank')}>
                                Download PDF
                            </Button>
                        </div>
                    </object>
                </div>
            </DialogContent>
        </Dialog>
    );
}

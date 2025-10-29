import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { whatsappTemplates, formatTemplate, type WhatsAppTemplate } from "@/lib/whatsappTemplates";
import { SheetLead } from "@/lib/googleSheets";
import { authService } from "@/lib/authService";
import { formatDisplayDate } from "@/lib/dateUtils";

interface WhatsAppTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  lead: SheetLead;
}

const WhatsAppTemplateDialog = ({ open, onClose, lead }: WhatsAppTemplateDialogProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const session = authService.getSession();

  const getTemplateVariables = () => ({
    customerName: lead.travellerName,
    destination: lead.travelState,
    userName: session?.user.name || 'Travel Consultant',
    nights: lead.nights,
    pax: lead.pax,
    hotelCategory: lead.hotelCategory,
    mealPlan: lead.mealPlan,
    tripId: lead.tripId,
    travelDate: lead.travelDate ? formatDisplayDate(lead.travelDate) : '',
  });

  const handleTemplateSelect = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template);
    const formatted = formatTemplate(template.message, getTemplateVariables());
    setCustomMessage(formatted);
  };

  const handleSendWhatsApp = () => {
    const message = customMessage || `Hi ${lead.travellerName}, this is regarding your trip inquiry.`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodedMessage}`, '_blank');
    onClose();
  };

  const handleCustomChat = () => {
    window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}`, '_blank');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            WhatsApp Templates - {lead.travellerName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 h-[60vh]">
          <div className="col-span-1 border-r pr-4">
            <h3 className="font-semibold mb-3 text-sm">Select Template</h3>
            <ScrollArea className="h-[calc(60vh-2rem)]">
              <div className="space-y-2">
                {whatsappTemplates.map((template) => (
                  <Button
                    key={template.id}
                    variant={selectedTemplate?.id === template.id ? "default" : "outline"}
                    className="w-full justify-start text-left h-auto py-3"
                    onClick={() => handleTemplateSelect(template)}
                  >
                    <div>
                      <div className="font-medium text-sm">{template.name}</div>
                      <div className="text-xs opacity-70 line-clamp-2 mt-1">
                        {template.message.substring(0, 50)}...
                      </div>
                    </div>
                  </Button>
                ))}
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 h-auto py-3 border-dashed"
                  onClick={handleCustomChat}
                >
                  <Send className="h-4 w-4" />
                  <span className="text-sm">New Custom Chat</span>
                </Button>
              </div>
            </ScrollArea>
          </div>

          <div className="col-span-2">
            <h3 className="font-semibold mb-3 text-sm">Preview & Edit</h3>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Select a template or write your custom message..."
              className="h-[calc(60vh-8rem)] resize-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleSendWhatsApp}
                disabled={!customMessage}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <MessageCircle className="h-4 w-4" />
                Send via WhatsApp
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppTemplateDialog;

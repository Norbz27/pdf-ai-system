import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface TwoFAModalProps {
  open: boolean;
  onClose: () => void;
  onVerify: () => void;
}

const TwoFAModal = ({ open, onClose, onVerify }: TwoFAModalProps) => {
  const [code, setCode] = useState("");
  const { toast } = useToast();

  const handleVerify = async () => {
    if (!code) {
      toast({
        title: "Missing Code",
        description: "Please enter the 2FA code.",
        variant: "warning",
      });
      return;
    }

    // Get the JWT token from localStorage
    const token = localStorage.getItem('authToken');
    
    if (!token) {
      toast({
        title: "Authentication Error",
        description: "Please log in again.",
        variant: "destructive",
      });
      return;
    }

    const response = await fetch('/api/auth/verify/2fa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();

    if (response.ok) {
      onVerify();
      toast({
        title: "Success",
        description: "2FA verification successful!",
        variant: "success",
      });
      onClose();
    } else {
      toast({
        title: "Verification Failed",
        description: data.error || "Invalid 2FA code.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Two-Factor Authentication</DialogTitle>
          <DialogDescription>
            Please enter the 2FA code sent to your authenticator app.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="text"
          placeholder="Enter 2FA code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button onClick={handleVerify}>Verify</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </DialogContent>
    </Dialog>
  );
};

export default TwoFAModal;

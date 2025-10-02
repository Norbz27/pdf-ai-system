import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS } from "@/lib/api";

interface TwoFAModalProps {
  open: boolean;
  onClose: () => void;
  // onVerify can optionally receive a token when used in forgot-password flow
  onVerify: (data?: { token?: string }) => void;
  // Optional token for forgot-password flow; when provided, verification uses the forgot-password endpoint
  forgotToken?: string;
}

const TwoFAModal = ({ open, onClose, onVerify, forgotToken }: TwoFAModalProps) => {
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

    let response: Response;
    try {
      if (forgotToken) {
        // Forgot-password 2FA verification (no auth header)
        response = await fetch(API_ENDPOINTS.auth.forgotPasswordVerify2FA, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: forgotToken, code }),
        });
      } else {
        // Normal login 2FA verification (requires auth token)
        const token = localStorage.getItem('authToken');
        if (!token) {
          toast({
            title: "Authentication Error",
            description: "Please log in again.",
            variant: "destructive",
          });
          return;
        }
        response = await fetch(API_ENDPOINTS.users.verify2FA, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ code }),
        });
      }

      const data = await response.json();

      if (response.ok) {
        // Pass token back for forgot-password flow, otherwise nothing
        onVerify(data?.token ? { token: data.token } : undefined);
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
    } catch (err) {
      console.error('2FA verification error:', err);
      toast({
        title: "Verification Error",
        description: "An error occurred during verification.",
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
            Please enter the 2FA code from your authenticator app.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="text"
          placeholder="Enter 2FA code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleVerify}>Verify</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TwoFAModal;

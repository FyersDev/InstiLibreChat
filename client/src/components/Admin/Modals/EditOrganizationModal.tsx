import { useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Input, useToastContext, DropdownPopup } from '@librechat/client';
import { ChevronDown } from 'lucide-react';
import { saasApi } from '~/services/saasApi';

interface EditOrganizationModalProps {
  organization: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditOrganizationModal({
  organization,
  onClose,
  onSuccess,
}: EditOrganizationModalProps) {
  const { showToast } = useToastContext();
  const [formData, setFormData] = useState({
    name: organization.name || '',
    legal_name: organization.legal_name || '',
    website: organization.website || '',
    primary_contact_email: organization.primary_contact_email || '',
    primary_contact_name: organization.primary_contact_name || '',
    primary_contact_phone: organization.primary_contact_phone || '',
    billing_email: organization.billing_email || '',
    address_line1: organization.address_line1 || '',
    city: organization.city || '',
    state_province: organization.state_province || '',
    postal_code: organization.postal_code || '',
    country: organization.country || '',
    subscription_plan: organization.subscription_plan || 'free',
    status: organization.status || 'active',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(organization.logo_url || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isSubscriptionMenuOpen, setIsSubscriptionMenuOpen] = useState(false);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Logo file size must be less than 5MB');
        return;
      }
      setLogoFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Prepare payload - backend expects pointer fields (*string)
      // Name is required, others are optional - send null for empty optional fields
      const payload: any = {
        name: formData.name.trim() || null,
      };
      
      // Optional fields - send null if empty (backend will ignore null and keep existing value)
      payload.legal_name = formData.legal_name.trim() || null;
      payload.website = formData.website.trim() || null;
      payload.primary_contact_email = formData.primary_contact_email.trim() || null;
      payload.primary_contact_name = formData.primary_contact_name.trim() || null;
      payload.primary_contact_phone = formData.primary_contact_phone.trim() || null;
      payload.billing_email = formData.billing_email.trim() || null;
      payload.address_line1 = formData.address_line1.trim() || null;
      payload.city = formData.city.trim() || null;
      payload.state_province = formData.state_province.trim() || null;
      payload.postal_code = formData.postal_code.trim() || null;
      payload.country = formData.country.trim() || null;
      payload.subscription_plan = formData.subscription_plan.trim() || null;
      // Status should always be sent if it has a value (not null)
      if (formData.status && formData.status.trim()) {
        payload.status = formData.status.trim();
      }

      // Convert logo to base64 if a new file is selected
      if (logoFile) {
        try {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const base64String = reader.result as string;
              resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(logoFile);
          });
          const base64Logo = await base64Promise;
          payload.logo_url = base64Logo;
        } catch (logoErr: any) {
          console.error('Logo conversion error:', logoErr);
          setError('Failed to process logo: ' + (logoErr.message || 'Unknown error'));
          setLoading(false);
          return;
        }
      }

      await saasApi.updateOrganization(organization.id, payload);
      showToast({
        message: `Organization "${formData.name}" updated successfully`,
        status: 'success',
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to update organization');
      showToast({
        message: err.message || 'Failed to update organization',
        status: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">Edit Organization</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Name
              </label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 "
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              <div className="relative">
                <DropdownPopup
                  portal={false}
                  sameWidth={true}
                  anchor={{ x: 'start', y: 'bottom' }}
                  menuId="org-status-selector-edit"
                  isOpen={isStatusMenuOpen}
                  setIsOpen={setIsStatusMenuOpen}
                  trigger={
                    <Ariakit.MenuButton
                      style={{ height: '40px' }}
                      className="w-full flex items-center justify-between gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm font-normal text-gray-900 dark:text-gray-100 transition-all hover:border-gray-400 dark:hover:border-gray-500"
                    >
                      <span className="capitalize">{formData.status}</span>
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </Ariakit.MenuButton>
                  }
                  items={[
                    {
                      label: 'Active',
                      onClick: () => {
                        setFormData({ ...formData, status: 'active' });
                        setIsStatusMenuOpen(false);
                      },
                    },
                    {
                      label: 'Pending',
                      onClick: () => {
                        setFormData({ ...formData, status: 'pending' });
                        setIsStatusMenuOpen(false);
                      },
                    },
                    {
                      label: 'Suspended',
                      onClick: () => {
                        setFormData({ ...formData, status: 'suspended' });
                        setIsStatusMenuOpen(false);
                      },
                    },
                    {
                      label: 'Deleted',
                      onClick: () => {
                        setFormData({ ...formData, status: 'deleted' });
                        setIsStatusMenuOpen(false);
                      },
                    },
                  ]}
                  className="w-full rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                  itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Legal Name
            </label>
            <Input
              type="text"
              value={formData.legal_name}
              onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Logo
            </label>
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="block w-full text-sm text-gray-500 dark:text-gray-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                  dark:file:bg-blue-900 dark:file:text-blue-300
                  dark:hover:file:bg-blue-800"
              />
              {logoPreview && (
                <div className="flex-shrink-0">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="w-16 h-16 object-cover rounded-lg border border-gray-300 dark:border-gray-600"
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {organization.logo_url ? 'Current logo shown. Select a new file to replace it.' : 'Recommended: Square image, max 5MB (PNG, JPG, GIF, SVG)'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Website
            </label>
            <Input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Primary Contact Email
              </label>
              <Input
                type="email"
                value={formData.primary_contact_email}
                onChange={(e) => setFormData({ ...formData, primary_contact_email: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Primary Contact Name
              </label>
              <Input
                type="text"
                value={formData.primary_contact_name}
                onChange={(e) => setFormData({ ...formData, primary_contact_name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Primary Contact Phone
            </label>
            <Input
              type="tel"
              value={formData.primary_contact_phone}
              onChange={(e) => setFormData({ ...formData, primary_contact_phone: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Billing Email
            </label>
            <Input
              type="email"
              value={formData.billing_email}
              onChange={(e) => setFormData({ ...formData, billing_email: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Address
            </label>
            <Input
              type="text"
              value={formData.address_line1}
              onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                City
              </label>
              <Input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                State/Province
              </label>
              <Input
                type="text"
                value={formData.state_province}
                onChange={(e) => setFormData({ ...formData, state_province: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Postal Code
              </label>
              <Input
                type="text"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Country
            </label>
            <Input
              type="text"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Subscription Plan
            </label>
            <div className="relative">
              <DropdownPopup
                portal={false}
                sameWidth={true}
                anchor={{ x: 'start', y: 'bottom' }}
                menuId="subscription-selector-edit"
                isOpen={isSubscriptionMenuOpen}
                setIsOpen={setIsSubscriptionMenuOpen}
                trigger={
                  <Ariakit.MenuButton
                    style={{ height: '40px' }}
                    className="w-full flex items-center justify-between gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm font-normal text-gray-900 dark:text-gray-100 transition-all hover:border-gray-400 dark:hover:border-gray-500"
                  >
                    <span className="capitalize">{formData.subscription_plan}</span>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </Ariakit.MenuButton>
                }
                items={[
                  {
                    label: 'Free',
                    onClick: () => {
                      setFormData({ ...formData, subscription_plan: 'free' });
                      setIsSubscriptionMenuOpen(false);
                    },
                  },
                  {
                    label: 'Starter',
                    onClick: () => {
                      setFormData({ ...formData, subscription_plan: 'starter' });
                      setIsSubscriptionMenuOpen(false);
                    },
                  },
                  {
                    label: 'Pro',
                    onClick: () => {
                      setFormData({ ...formData, subscription_plan: 'pro' });
                      setIsSubscriptionMenuOpen(false);
                    },
                  },
                  {
                    label: 'Enterprise',
                    onClick: () => {
                      setFormData({ ...formData, subscription_plan: 'enterprise' });
                      setIsSubscriptionMenuOpen(false);
                    },
                  },
                  {
                    label: 'Trial',
                    onClick: () => {
                      setFormData({ ...formData, subscription_plan: 'trial' });
                      setIsSubscriptionMenuOpen(false);
                    },
                  },
                ]}
                className="w-full rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              />
            </div>
          </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 mt-6">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400">
              {loading ? 'Updating...' : 'Update Organization'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

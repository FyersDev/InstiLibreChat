import { useState, useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Input, useToastContext, DropdownPopup } from '@librechat/client';
import { ChevronDown } from 'lucide-react';
import { saasApi } from '~/services/saasApi';

interface EditUserModalProps {
  user: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const { showToast } = useToastContext();
  const [formData, setFormData] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    phone: user.phone || '',
    status: user.status || 'active',
    timezone: user.timezone || '',
    locale: user.locale || '',
    role_id: '',
    role_name: '',
  });
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);

  // Fetch roles on mount
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const data = await saasApi.getRoles();
        const rolesList = Array.isArray(data)
          ? data
          : (data as any).roles || (data as any).data || [];

        // Remove duplicates based on role ID
        const uniqueRoles = Array.from(
          new Map(rolesList.map((role: any) => [role.id, role])).values()
        );
        
        // Filter to show only "Org Admin" and "User" roles
        const filteredRoles = uniqueRoles.filter((role: any) => {
          const roleName = role.name.toLowerCase();
          return roleName === 'org admin' || roleName === 'user';
        });
        
        // Deduplicate by role name (show each role type only once)
        const roleNameMap = new Map();
        filteredRoles.forEach((role: any) => {
          const roleName = role.name.toLowerCase();
          // Keep the first occurrence of each role name
          if (!roleNameMap.has(roleName)) {
            roleNameMap.set(roleName, role);
          }
        });
        const finalRoles = Array.from(roleNameMap.values());
        
        setAvailableRoles(finalRoles);
        
        // Set initial role_id from user's current role
        if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
          const currentRole = user.roles[0];
          setFormData(prev => ({
            ...prev,
            role_id: currentRole.id,
            role_name: currentRole.name,
          }));
        }
      } catch (error) {
        console.error('Error fetching roles:', error);
      }
    };

    fetchRoles();
  }, [user.roles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: any = {};
      if (formData.first_name) payload.first_name = formData.first_name;
      if (formData.last_name) payload.last_name = formData.last_name;
      if (formData.phone) payload.phone = formData.phone;
      if (formData.status) payload.status = formData.status;
      if (formData.timezone) payload.timezone = formData.timezone;
      if (formData.locale) payload.locale = formData.locale;

      // Include role assignment (required - determines org_role automatically)
      if (formData.role_id && formData.role_id.trim() !== '') {
        payload.role_id = formData.role_id;
        // Set org_role based on selected role name
        const selectedRole = availableRoles.find(r => r.id === formData.role_id);
        if (selectedRole) {
          payload.org_role = selectedRole.name.toLowerCase() === 'org admin' ? 'admin' : 'user';
        }
      } else if (formData.role_name && formData.role_name.trim() !== '') {
        payload.role_name = formData.role_name;
        payload.org_role = formData.role_name.toLowerCase() === 'org admin' ? 'admin' : 'user';
      }

      await saasApi.updateUser(user.id, payload);
      showToast({
        message: `User "${user.email}" updated successfully`,
        status: 'success',
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
      showToast({
        message: err.message || 'Failed to update user',
        status: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">Edit User</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <Input
              type="email"
              value={user.email}
              disabled
              className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                First Name
              </label>
              <Input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Last Name
              </label>
              <Input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Phone
            </label>
            <Input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
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
                menuId="status-selector-edit"
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
                ]}
                className="w-full rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Role *
            </label>
            <div className="relative">
              <DropdownPopup
                portal={false}
                sameWidth={true}
                anchor={{ x: 'start', y: 'bottom' }}
                menuId="role-selector-edit"
                isOpen={isRoleMenuOpen}
                setIsOpen={setIsRoleMenuOpen}
                trigger={
                  <Ariakit.MenuButton
                    style={{ height: '40px' }}
                    className="w-full flex items-center justify-between gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 text-sm font-normal text-gray-900 dark:text-gray-100 transition-all hover:border-gray-400 dark:hover:border-gray-500"
                  >
                    <span>{formData.role_name || 'Select Role'}</span>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </Ariakit.MenuButton>
                }
                items={availableRoles.map((role, index) => ({
                  label: role.name,
                  onClick: () => {
                    setFormData({
                      ...formData,
                      role_id: role.id,
                      role_name: role.name,
                    });
                    setIsRoleMenuOpen(false);
                  },
                }))}
                className="w-full rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                itemClassName="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              />
            </div>
            {availableRoles.length === 0 && (
              <p className="text-sm text-red-500 dark:text-red-400 mt-2">
                No roles available. Please create roles first.
              </p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Org Admins have full access and can see the admin panel. Users can upload documents and query.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Timezone
            </label>
            <Input
              type="text"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              placeholder="e.g., America/New_York"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Locale
            </label>
            <Input
              type="text"
              value={formData.locale}
              onChange={(e) => setFormData({ ...formData, locale: e.target.value })}
              placeholder="e.g., en-US"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 mt-6">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              {loading ? 'Updating...' : 'Update User'}
            </Button>
            </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

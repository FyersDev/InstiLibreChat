import { useState, useEffect, useMemo } from 'react';
import { PermissionManager, type Permission } from '~/utils/permissions';
import { saasApi } from '~/services/saasApi';
import { useAuthContext } from './AuthContext';

/**
 * Hook to check if user has upload_file-create permission
 * @returns boolean indicating if user can upload files
 */
export default function useUploadPermission() {
  const { user } = useAuthContext();
  const [permissionManager, setPermissionManager] = useState<PermissionManager | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        let permissions: Permission[] = [];

        // Try to get permissions from user object first
        if (user && (user as any).permissions && Array.isArray((user as any).permissions)) {
          permissions = (user as any).permissions;
        } else {
          // Try to get from localStorage
          const storedPerms = localStorage.getItem('permissions');
          if (storedPerms) {
            try {
              permissions = JSON.parse(storedPerms);
            } catch (e) {
              console.error('Error parsing stored permissions:', e);
            }
          }

          // If still no permissions, fetch from API
          if (permissions.length === 0 && user?.id) {
            try {
              const userData: any = await saasApi.getMe();
              if (userData?.permissions && Array.isArray(userData.permissions)) {
                permissions = userData.permissions;
                // Store in localStorage for future use
                localStorage.setItem('permissions', JSON.stringify(permissions));
              }
            } catch (error) {
              console.error('Error fetching user permissions:', error);
            }
          }
        }

        // Check if user is super admin - grant all permissions
        const userData: any = user || (await saasApi.getMe().catch(() => null));
        if (userData?.is_super_admin === true) {
          permissions = [
            {
              id: 'upload_file-create',
              resource: 'upload_file',
              action: 'create',
            },
          ];
        }

        const pm = new PermissionManager(permissions);
        setPermissionManager(pm);
      } catch (error) {
        console.error('Error loading permissions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, [user]);

  const canUpload = useMemo(() => {
    if (!permissionManager) {
      return false;
    }
    // Check for upload_file-create permission
    return permissionManager.hasPermission('upload_file', 'create');
  }, [permissionManager]);

  return { canUpload, loading };
}


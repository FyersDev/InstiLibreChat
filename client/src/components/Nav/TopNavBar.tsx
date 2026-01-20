import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import { PermissionManager, type Permission } from '~/utils/permissions';
import { saasApi } from '~/services/saasApi';
import Settings from './Settings';

// interface NiftyData {
//   symbol: string;
//   ltp: number;
//   open: number;
//   high: number;
//   low: number;
//   prevClose: number;
//   change: number;
//   changePercent: number;
//   volume: number;
//   timestamp: string;
// }

export default function TopNavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthContext();
  const [userInfo, setUserInfo] = useState<any>(null);
  const [permissionManager, setPermissionManager] = useState<PermissionManager | null>(null);
  const [activeMenu, setActiveMenu] = useState('FIA research');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // const [niftyData, setNiftyData] = useState<NiftyData | null>(null);
  // const [niftyLoading, setNiftyLoading] = useState(true);
  // const [niftyError, setNiftyError] = useState<string | null>(null);

  // Check and set dark mode on mount
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkMode(isDark);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    // Load user info and permissions
    const loadUserData = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) {
          console.warn('No access token found');
          return;
        }

        try {
          const data = await saasApi.getMe();
          setUserInfo(data);

          // Load permissions
          const storedPerms = localStorage.getItem('permissions');
          if (storedPerms) {
            try {
              const perms = JSON.parse(storedPerms);
              setPermissionManager(new PermissionManager(perms));
            } catch (error) {
              console.error('Error parsing permissions:', error);
            }
          }
        } catch (error: any) {
          console.error('Error loading user data:', error);
          // If it's a 401, try to refresh token
          if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
              try {
                const refreshData: any = await saasApi.refreshToken(refreshToken);
                if (refreshData.access_token) {
                  localStorage.setItem('access_token', refreshData.access_token);
                  if (refreshData.refresh_token) {
                    localStorage.setItem('refresh_token', refreshData.refresh_token);
                  }
                  // Retry loading user data
                  const retryData = await saasApi.getMe();
                  setUserInfo(retryData);
                }
              } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error in loadUserData:', error);
      }
    };

    loadUserData();

    // Determine active menu based on current route
    const path = location.pathname;
    if (path.includes('/admin')) {
      setActiveMenu('Admin');
    } else if (path.includes('/resources')) {
      setActiveMenu('Resources');
    } else if (path.includes('/templates')) {
      setActiveMenu('Customise');
    // } else if (path.includes('/screener')) {
    //   setActiveMenu('Screeners');
    } else {
      setActiveMenu('FIA research');
    }

    // Store current conversation ID when on a chat route
    // This allows us to restore it when navigating back from other tabs
    if (path.startsWith('/c/')) {
      const conversationId = path.replace('/c/', '');
      // Only store valid conversation IDs (not 'new')
      if (conversationId && conversationId !== 'new') {
        localStorage.setItem('lastConversationId', conversationId);
      }
    }
  }, [location.pathname]);

  // Fetch NIFTY data
  // const fetchNiftyData = async () => {
  //   try {
  //     setNiftyError(null);
  //     const baseHref = document.querySelector('base')?.getAttribute('href') || '/';
  //     // Remove trailing slash if present, then add the API path
  //     const cleanBaseUrl = baseHref.endsWith('/') ? baseHref.slice(0, -1) : baseHref;
  //     const apiUrl = `${cleanBaseUrl}/api/market/nifty`;
  //     
  //     const response = await fetch(apiUrl, {
  //       method: 'GET',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       credentials: 'include', // Include cookies for auth
  //     });

  //     // Check content type before parsing
  //     const contentType = response.headers.get('content-type') || '';
  //     
  //     // If response is HTML, the API endpoint doesn't exist (server needs restart or route not registered)
  //     if (contentType.includes('text/html')) {
  //       // Silently fail - API endpoint not available
  //       // Don't log or show errors - just silently return
  //       setNiftyError(null);
  //       setNiftyLoading(false);
  //       return;
  //     }

  //     if (!response.ok) {
  //       // If response is not OK, try to get error message
  //       if (contentType.includes('application/json')) {
  //         const errorData = await response.json();
  //         setNiftyError(errorData.error || `HTTP ${response.status}`);
  //       } else {
  //         // If non-HTML, non-JSON response
  //         setNiftyError(null); // Silently fail
  //       }
  //       setNiftyLoading(false);
  //       return;
  //     }

  //     // Ensure response is JSON before parsing
  //     if (!contentType.includes('application/json')) {
  //       // Silently fail if not JSON
  //       setNiftyError(null);
  //       setNiftyLoading(false);
  //       return;
  //     }

  //     const result = await response.json();

  //     if (result.success && result.data) {
  //       setNiftyData(result.data);
  //       setNiftyError(null); // Clear any previous errors
  //     } else {
  //       setNiftyError(result.error || null);
  //     }
  //   } catch (err: any) {
  //     // Silently handle all errors - don't log or show to user
  //     // This prevents console spam when API endpoint doesn't exist
  //     setNiftyError(null);
  //   } finally {
  //     setNiftyLoading(false);
  //   }
  // };

  // Fetch NIFTY data on mount and set up auto-refresh
  // useEffect(() => {
  //   fetchNiftyData();
  //   
  //   // Auto-refresh every 1 second for real-time updates
  //   const interval = setInterval(() => {
  //     fetchNiftyData();
  //   }, 100000000);

  //   return () => clearInterval(interval);
  // }, []);

  const handleMenuChange = (menu: string) => {
    setActiveMenu(menu);
    const baseHref = document.querySelector('base')?.getAttribute('href') || '/';

    switch (menu) {
      case 'Admin':
        navigate(`${baseHref}admin`);
        break;
      case 'FIA research': {
        // Restore last conversation if available, otherwise go to new chat
        const lastConversationId = localStorage.getItem('lastConversationId');
        if (lastConversationId && lastConversationId !== 'new') {
          navigate(`${baseHref}c/${lastConversationId}`);
        } else {
          navigate(`${baseHref}c/new`);
        }
        break;
      }
      case 'Customise':
        navigate(`${baseHref}templates`);
        break;
      // case 'Screeners':
      //   navigate(`${baseHref}screener`);
      //   break;
      case 'Resources':
        navigate(`${baseHref}resources`);
        break;
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const refreshToken = localStorage.getItem('refresh_token');
      if (token && refreshToken) {
        // Call logout endpoint if available
        try {
          await fetch('/api/v1/auth/logout', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
        } catch (error) {
          // Ignore logout API errors
        }
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    localStorage.removeItem('canAccessAdmin'); // Clear admin access flag on logout
    setIsDropdownOpen(false);
    logout();
  };

  const getUserInitials = () => {
    if (!userInfo) return 'US';
    
    // Get initials from first 2 letters of email
    const email = userInfo.email || userInfo.username || 'User';
    return email.substring(0, 2).toUpperCase();
  };

  const getUserDisplayName = () => {
    if (!userInfo) return 'User';
    // Show email as the main display name
    return userInfo.email || userInfo.username || userInfo.name || 'User';
  };

  const getUserSubtext = () => {
    // Don't show any subtext (no ID)
    return '';
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    handleLogout();
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  const handleSettingsClick = () => {
    setIsDropdownOpen(false);
    setShowSettings(true);
  };

  // State to track admin access - DEFAULT TO FALSE (hide Admin tab by default)
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);

  // Check admin access whenever userInfo or permissions change
  useEffect(() => {
    // DEFAULT: No admin access unless explicitly proven
    let hasAccess = false;
    
    // First check localStorage (set during login for immediate availability)
    const storedCanAccessAdmin = localStorage.getItem('canAccessAdmin');
    if (storedCanAccessAdmin !== null) {
      try {
        const parsed = JSON.parse(storedCanAccessAdmin);
        // Only set to true if explicitly true
        hasAccess = parsed === true;
      } catch (e) {
        // If parsing fails, keep false (no admin access)
        hasAccess = false;
      }
    }
    
    // If not in localStorage or userInfo is available, re-check from userInfo
    // Check based on org_role: show admin panel if org_role === 'admin' OR is_super_admin === true
    if (!hasAccess && userInfo) {
      // Explicitly check for super admin
      const isSuperAdmin = userInfo.is_super_admin === true;
      
      // Check org_role - admin access if org_role === 'admin'
      const orgRole = userInfo.org_role || userInfo.orgRole;
      const isOrgAdmin = orgRole === 'admin';

      // Only super admins or users with org_role === 'admin' can access
      hasAccess = isSuperAdmin || isOrgAdmin;
      
      // Update localStorage with the current check
      localStorage.setItem('canAccessAdmin', JSON.stringify(hasAccess));
    }
    
    // Update state - this will trigger re-render and hide/show Admin tab
    setCanAccessAdmin(hasAccess);
    
    // Debug log (remove in production)
    console.log('Admin access check:', {
      hasAccess,
      isSuperAdmin: userInfo?.is_super_admin,
      orgRole: userInfo?.org_role || userInfo?.orgRole,
      isOrgAdmin: userInfo ? (userInfo.org_role === 'admin' || userInfo.orgRole === 'admin') : false,
      userInfo: userInfo ? 'loaded' : 'not loaded',
      storedCanAccessAdmin
    });
  }, [userInfo]);

  // Show only 4 tabs for verified users: FIA research, Screeners, Resources, Customise
  // Admin is only shown for super admins or users with org_role === 'admin'
  // CRITICAL: Default to hiding Admin tab - only show if explicitly allowed
  const allMenus = ['Admin', 'FIA research', 'Resources', 'Customise'];//screeners removed
  const menus = allMenus.filter((menu) => {
    // STRICT CHECK: Only show Admin if canAccessAdmin is explicitly true
    // This ensures Admin is hidden by default for ALL users (including when userInfo hasn't loaded)
    if (menu === 'Admin') {
      // Triple check: must be explicitly true, not just truthy
      if (canAccessAdmin === true) {
        return true;
      }
      // Hide Admin tab for all other cases
      return false;
    }
    // Always show Customise, FIA research, Screeners, and Resources
    return true;
  });

  // Format NIFTY data for display
  // const formatNiftyValue = () => {
  //   if (niftyLoading) {
  //     return 'Loading...';
  //   }
  //   if (niftyError || !niftyData) {
  //     return 'N/A';
  //   }
  //   return niftyData.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // };

  // const formatNiftyChange = () => {
  //   if (!niftyData) return { value: '0.00', percent: '(0.00%)', isPositive: true };
  //   const isPositive = niftyData.change >= 0;
  //   const changeValue = Math.abs(niftyData.change).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  //   const changePercent = Math.abs(niftyData.changePercent).toFixed(2);
  //   return {
  //     value: `${isPositive ? '+' : '-'}${changeValue}`,
  //     percent: `(${isPositive ? '+' : '-'}${changePercent}%)`,
  //     isPositive
  //   };
  // };

  return (
    <nav className="bg-white dark:!bg-[#111111] border-b border-[#EDEDED] dark:border-gray-700 px-3 sm:px-4 md:px-6 py-1 flex-shrink-0 z-50 min-h-[48px]">
      <div className="flex items-center justify-between relative">
        {/* Left: FYERS Logo & Financial Data */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* FYERS Logo */}
          <div className="flex items-center">
            <img
              src="/assets/Logo.svg"
              alt="FYERS"
              className="h-8 w-auto object-contain"
              style={{ borderRadius: '2px' }}
            />
          </div>
          
          {/* NIFTY Display - Fixed width container to prevent layout shifts */}
          {/* <div className="flex items-center gap-2 min-w-[280px] font-Inter" style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'Inter, sans-serif' }}>
            <span className="text-[#2A2A2A] dark:text-gray-100 text-[14px] font-medium leading-[20px] whitespace-nowrap">NIFTY</span>
            <span className="text-[#2A2A2A] dark:text-gray-100 text-[14px] font-medium leading-[20px] tabular-nums min-w-[90px] text-right">
              {formatNiftyValue()}
            </span>
            {niftyData && (
              <span 
                className={`text-[14px] font-normal leading-[20px] tabular-nums whitespace-nowrap ${
                  formatNiftyChange().isPositive 
                    ? 'text-[#007A27] dark:text-[#7DDB89]' 
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatNiftyChange().value} {formatNiftyChange().percent}
              </span>
            )}
            {niftyError && (
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap" title={niftyError}>
                Data not availables
              </span>
            )}
          </div> */}
        </div>

        {/* Center: Primary Menu - Absolutely centered */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-2 sm:gap-3 md:gap-4">
          {menus.map((menu) => (
            <button
              key={menu}
              onClick={() => handleMenuChange(menu)}
              className={`px-3 py-1 sm:px-4 sm:py-1 md:px-5 md:py-1 rounded-lg text-sm sm:text-base transition whitespace-nowrap ${
                activeMenu === menu
                  ? 'bg-[#F2F4FF] text-[#2434E7] dark:bg-[#2A2A2A] dark:text-[#A0A8FF]'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {menu}
            </button>
          ))}
        </div>

        {/* Right: User Actions */}
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0 relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-300 to-purple-400 rounded-full flex items-center justify-center text-white font-semibold text-sm sm:text-base">
              {getUserInitials()}
            </div>
            <svg
              className={`w-4 h-4 text-gray-600 dark:text-gray-300 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-[380px] bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
              {/* User Profile Section */}
              <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-300 to-purple-400 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                    {getUserInitials()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-gray-900 dark:text-white truncate">
                      {getUserDisplayName()}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {getUserSubtext()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="py-2">
                {/* Settings */}
                <button
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-[#222222] transition-colors"
                  onClick={handleSettingsClick}
                >
                  <svg
                    className="w-6 h-6 text-gray-700 dark:text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-base text-gray-900 dark:text-white">Settings</span>
                </button>
                {/* Logout */}
                <button
                  onClick={handleLogoutClick}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-[#222222] transition-colors text-[#BB5850]"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="text-base font-medium">Logout</span>
                </button>
              </div>
            </div>
          )}

          {/* Logout Confirmation Modal */}
          {showLogoutConfirm && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={cancelLogout}>
              <div className="bg-[#1a1a1a] rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4 border border-gray-800" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col items-center text-center">
                  <img src="/assets/warning.svg" alt="Warning" className="w-10 h-10 mb-4" style={{ fill: '#BB5850' }} />
                  <h3 className="text-lg font-bold text-white mb-2">Logout</h3>
                  <p className="text-sm text-gray-300 mb-4">Are you sure you want to logout?</p>
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={confirmLogout}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#BB5850] hover:bg-[#A34B44] transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={cancelLogout}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white border-2 border-[#BB5850] hover:bg-[#BB5850]/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
    </nav>
  );
}


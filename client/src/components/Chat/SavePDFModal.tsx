import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, useToastContext } from '@librechat/client';
import { Button } from '@librechat/client';
import { saasApi } from '~/services/saasApi'; // API service - connects to insti-inquora backend
import { Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { NotificationSeverity } from '~/common';

interface SavePDFModalProps {
  conversationId: string;
  pdfContent: string;
  onClose: () => void;
}

interface FlatFolder {
  id: string;
  name: string;
  path: string;
  level: number;
}

// Helper function to add CSS styles for better page breaks
const addPageBreakCSS = (htmlContent: string): string => {
  const cssStyles = `
    <style>
      /* Prevent content from breaking awkwardly */
      p, li, span, h1, h2, h3, h4, h5, h6 {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        orphans: 3 !important;
        widows: 3 !important;
      }
      
      /* Keep paragraphs together with headers */
      h1 + p, h2 + p, h3 + p, 
      h4 + p, h5 + p, h6 + p {
        page-break-before: avoid !important;
        break-before: avoid !important;
      }
      
      /* Prevent lists from breaking */
      ul, ol {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      li {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      
      /* Prevent tables from breaking */
      table, .table-wrapper {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin-top: 20px !important;
        margin-bottom: 20px !important;
      }
      
      thead {
        display: table-header-group;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      tbody {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      /* Prevent inline elements from breaking */
      strong, b, em, i, u, code {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      /* Add minimum spacing to avoid tight breaks */
      .message, .chat-block, .content-block {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin-bottom: 15px !important;
        padding-bottom: 10px !important;
      }
      
      /* Explicit page break points */
      .page-break {
        page-break-after: always !important;
        break-after: page !important;
      }
      
      /* Prevent sections from breaking */
      section, article {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
      /* Add space before page breaks */
      .before-page-break {
        margin-bottom: 30px !important;
      }
      
      /* Prevent blockquotes from breaking */
      blockquote {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin: 15px 0 !important;
      }
      
      /* Line height to prevent awkward breaks */
      body {
        line-height: 1.6 !important;
      }
    </style>
  `;
  
  // Insert styles at the beginning of HTML
  return cssStyles + htmlContent;
};

export default function SavePDFModal({ conversationId, pdfContent, onClose }: SavePDFModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [pdfName, setPdfName] = useState<string>('');
  const { showToast } = useToastContext();

  useEffect(() => {
    loadUserInfo();
  }, []);

  useEffect(() => {
    if (userInfo) {
      if (userInfo.is_super_admin) {
        loadOrganizations();
      } else {
        // For regular users, use their org_id
        if (userInfo.org_id) {
          setSelectedOrgId(userInfo.org_id);
          loadFolders(userInfo.org_id);
        } else {
          setError('You are not associated with an organization. Please contact your administrator.');
        }
      }
    }
  }, [userInfo]);

  useEffect(() => {
    // When super admin selects an org, load folders for that org
    if (userInfo?.is_super_admin && selectedOrgId) {
      loadFolders(selectedOrgId);
    }
  }, [selectedOrgId]);

  const loadUserInfo = async () => {
    try {
      const user: any = await saasApi.getMe();
      setUserInfo(user);
    } catch (err) {
      console.error('Error loading user info:', err);
      setError('Failed to load user information');
    }
  };

  const loadOrganizations = async () => {
    try {
      const data = await saasApi.getOrganizations(true, undefined);
      const orgs = Array.isArray(data) ? data : (data as any).data || [];
      setOrganizations(orgs);
      if (orgs.length > 0) {
        // Select first org by default for super admin
        setSelectedOrgId(orgs[0].id);
      }
    } catch (err: any) {
      console.error('Error loading organizations:', err);
      setError('Failed to load organizations');
    }
  };

  const loadFolders = async (orgId: string) => {
    if (!orgId) {
      setFolders([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await saasApi.getFolderTree(orgId);
      setFolders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load folders');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const flattenFolders = (folderNodes: any[], level = 0): FlatFolder[] => {
    let result: FlatFolder[] = [];
    folderNodes.forEach((folder) => {
      result.push({
        id: folder.id,
        name: folder.name,
        path: folder.path || folder.name,
        level,
      });
      if (folder.children && folder.children.length > 0) {
        result = result.concat(flattenFolders(folder.children, level + 1));
      }
    });
    return result;
  };

  const flatFolders = flattenFolders(folders);

  const handleSave = async () => {
    // Store original body styles to restore later
    const originalBodyStyles = {
      overflow: document.body.style.overflow,
      width: document.body.style.width,
      paddingRight: document.body.style.paddingRight,
      position: document.body.style.position,
    };
    
    // Store original html styles
    const originalHtmlStyles = {
      overflow: document.documentElement.style.overflow,
      width: document.documentElement.style.width,
    };
    
    let styleMonitor: NodeJS.Timeout | null = null;
    
    try {
      setSaving(true);
      setError(null);

      // Validate PDF content
      console.log('PDF Content length:', pdfContent?.length);
      console.log('PDF Content preview:', pdfContent?.substring(0, 500));
      
      if (!pdfContent || pdfContent.trim().length === 0) {
        throw new Error('No content available to generate PDF. Please try again.');
      }

      // Force body and html to maintain their dimensions
      const forceBodyStyles = () => {
        document.body.style.overflow = originalBodyStyles.overflow || 'auto';
        document.body.style.width = originalBodyStyles.width || '100%';
        document.body.style.paddingRight = originalBodyStyles.paddingRight || '0px';
        document.documentElement.style.overflow = originalHtmlStyles.overflow || 'auto';
        document.documentElement.style.width = originalHtmlStyles.width || '100%';
      };
      
      // Apply immediately
      forceBodyStyles();
      
      // Monitor and fix any style changes during PDF generation
      styleMonitor = setInterval(forceBodyStyles, 50);
      
      // Add CSS for page breaks BEFORE rendering
      const contentWithStyles = addPageBreakCSS(pdfContent);
      
      // Create a temporary div to render HTML - completely isolated from layout
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = contentWithStyles;
      // A4 proportions: 210mm x 297mm, using 210mm width with proper scaling
      // At 96 DPI: 210mm = 794px, but we use 750px for better margins
      tempDiv.style.cssText = `
        position: fixed !important;
        left: -99999px !important;
        top: 0 !important;
        width: 750px !important;
        height: auto !important;
        background-color: #ffffff !important;
        overflow: visible !important;
        box-sizing: border-box !important;
        z-index: -99999 !important;
        pointer-events: none !important;
        display: block !important;
        padding: 20px !important;
      `;
      
      // Append to body
      document.body.appendChild(tempDiv);
      
      // Force styles again after appending
      forceBodyStyles();
      
      console.log('TempDiv appended, content length:', tempDiv.innerHTML.length);
      console.log('TempDiv dimensions:', tempDiv.offsetWidth, 'x', tempDiv.offsetHeight);
      
      // Wait for DOM to be ready and get element positions
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      // Get positions of all important elements (tables, messages, etc.)
      // This helps us find natural break points
      const tableWrappers = tempDiv.querySelectorAll('.table-wrapper, table');
      const messages = tempDiv.querySelectorAll('.message');
      const breakableElements: Array<{ top: number; bottom: number; height: number; type: string; canBreakBefore: boolean }> = [];
      
      // Get the container's scroll height for accurate positioning
      const containerHeight = tempDiv.scrollHeight || tempDiv.offsetHeight;
      
      // Helper function to get element position
      const getElementPosition = (element: HTMLElement) => {
        let top = 0;
        let currentElement: HTMLElement | null = element;
        
        // Calculate position relative to tempDiv
        while (currentElement && currentElement !== tempDiv) {
          top += currentElement.offsetTop;
          currentElement = currentElement.offsetParent as HTMLElement | null;
        }
        
        const height = element.offsetHeight || element.scrollHeight;
        const bottom = top + height;
        
        return { top, bottom, height };
      };
      
      // Collect table positions (cannot break inside)
      tableWrappers.forEach((wrapper) => {
        let element = wrapper as HTMLElement;
        // If it's a table, find its wrapper
        if (element.tagName === 'TABLE' && element.parentElement) {
          const wrapperEl = element.closest('.table-wrapper') || element.parentElement;
          element = wrapperEl as HTMLElement;
        }
        
        const pos = getElementPosition(element);
        breakableElements.push({
          ...pos,
          type: 'table',
          canBreakBefore: true, // Can break before table, but not inside
        });
      });
      
      // Collect message positions (can break between messages)
      messages.forEach((message) => {
        const element = message as HTMLElement;
        const pos = getElementPosition(element);
        breakableElements.push({
          ...pos,
          type: 'message',
          canBreakBefore: true, // Can break before messages
        });
        
        // Also collect paragraph positions within messages to avoid breaking lines
        const paragraphs = element.querySelectorAll('p, div.message-content > div, li, h1, h2, h3, h4, h5, h6');
        paragraphs.forEach((para) => {
          const paraElement = para as HTMLElement;
          // Only add if paragraph has meaningful height (not empty)
          if (paraElement.offsetHeight > 10) {
            const paraPos = getElementPosition(paraElement);
            breakableElements.push({
              ...paraPos,
              type: 'paragraph',
              canBreakBefore: true, // Can break before paragraphs, but not inside
            });
          }
        });
      });
      
      // Sort by top position
      breakableElements.sort((a, b) => a.top - b.top);
      
      // Keep old tablePositions for backward compatibility
      const tablePositions = breakableElements.filter(el => el.type === 'table');

      // Wait for all images to fully load before capturing
      const images = tempDiv.querySelectorAll('img');
      const imagePromises = Array.from(images).map((img: HTMLImageElement) => {
        return new Promise<void>((resolve) => {
          if (img.complete && img.naturalHeight !== 0) {
            resolve();
          } else {
            img.onload = () => resolve();
            img.onerror = () => resolve(); // Continue even if image fails to load
            // Timeout after 5 seconds
            setTimeout(() => resolve(), 5000);
          }
        });
      });
      
      await Promise.all(imagePromises);
      
      // Additional wait to ensure rendering is complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Try to load logo image for header (PNG format)
      let logoDataUrl: string | null = null;
      try {
        const logoUrl = `${window.location.origin}/assets/LOGO.png`;
        const logoResponse = await fetch(logoUrl);
        if (logoResponse.ok) {
          const logoBlob = await logoResponse.blob();
          logoDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(logoBlob);
          });
        }
      } catch (error) {
        console.log('Logo not available, using text fallback:', error);
      }

      // Convert HTML to canvas using html2canvas with better image handling
      console.log('Starting html2canvas conversion...');
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        allowTaint: true, // Allow cross-origin images
        imageTimeout: 15000,
        removeContainer: false,
        windowWidth: 800,
        windowHeight: tempDiv.scrollHeight,
        onclone: (clonedDoc) => {
          // Apply orphans/widows rules to all relevant elements
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el) => {
            const element = el as HTMLElement;
            
            // Apply orphans/widows rules to paragraphs and list items
            if (element.tagName === 'P' || element.tagName === 'LI') {
              element.style.marginBottom = '12px';
              element.style.paddingBottom = '5px';
              element.style.pageBreakInside = 'avoid';
              element.style.breakInside = 'avoid';
              element.style.orphans = '3';
              element.style.widows = '3';
            }
            
            // Prevent headings from being orphaned
            if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName)) {
              element.style.pageBreakAfter = 'avoid';
              element.style.breakAfter = 'avoid';
              element.style.pageBreakInside = 'avoid';
              element.style.breakInside = 'avoid';
              element.style.marginBottom = '15px';
              element.style.paddingBottom = '5px';
            }
            
            // Prevent divs with content from breaking
            if (element.tagName === 'DIV' && element.textContent && element.textContent.trim().length > 0) {
              element.style.pageBreakInside = 'avoid';
              element.style.breakInside = 'avoid';
            }
            
            // Ensure tables have proper breaks
            if (element.tagName === 'TABLE') {
              element.style.pageBreakInside = 'avoid';
              element.style.breakInside = 'avoid';
              element.style.marginTop = '20px';
              element.style.marginBottom = '20px';
            }
          });
          
          // Ensure all images in cloned document are fully loaded
          const clonedImages = clonedDoc.querySelectorAll('img');
          clonedImages.forEach((img: HTMLImageElement) => {
            // Set display to block to prevent inline spacing issues
            img.style.display = 'block';
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.pageBreakInside = 'avoid';
            img.style.breakInside = 'avoid';
          });
          
          // Ensure tables are properly structured and styled
          const clonedTables = clonedDoc.querySelectorAll('table');
          clonedTables.forEach((table) => {
            const htmlTable = table as HTMLTableElement;
            
            // Wrap table in a container if not already wrapped to prevent page breaks
            let wrapper = htmlTable.parentElement;
            if (!wrapper || (!wrapper.classList.contains('table-wrapper') && wrapper.tagName !== 'DIV')) {
              wrapper = clonedDoc.createElement('div');
              wrapper.className = 'table-wrapper';
              wrapper.style.cssText = 'page-break-inside: avoid !important; break-inside: avoid !important; margin: 20px 0; padding: 10px 0; display: block; width: 100%; min-height: 50px;';
              
              const parent = htmlTable.parentElement;
              if (parent) {
                parent.insertBefore(wrapper, htmlTable);
                wrapper.appendChild(htmlTable);
              }
            } else {
              // Ensure wrapper has proper styles with extra spacing
              if (wrapper.classList.contains('table-wrapper')) {
                wrapper.style.cssText = 'page-break-inside: avoid !important; break-inside: avoid !important; margin: 20px 0; padding: 10px 0; display: block; width: 100%; min-height: 50px;';
              }
            }
            
            // Force table layout to ensure proper rendering
            htmlTable.style.display = 'table';
            htmlTable.style.width = '100%';
            htmlTable.style.maxWidth = '100%';
            htmlTable.style.borderCollapse = 'separate';
            htmlTable.style.borderSpacing = '0';
            htmlTable.style.tableLayout = 'auto';
            htmlTable.style.boxSizing = 'border-box';
            htmlTable.style.pageBreakInside = 'avoid';
            htmlTable.style.breakInside = 'avoid';
            
            // Add extra spacing before and after table to prevent cuts
            const tableWrapper = htmlTable.closest('.table-wrapper') || htmlTable.parentElement;
            if (tableWrapper) {
              (tableWrapper as HTMLElement).style.marginTop = '20px';
              (tableWrapper as HTMLElement).style.marginBottom = '20px';
              (tableWrapper as HTMLElement).style.paddingTop = '10px';
              (tableWrapper as HTMLElement).style.paddingBottom = '10px';
            }
            
            // Ensure all table cells have proper borders and styling
            const cells = htmlTable.querySelectorAll('th, td');
            cells.forEach((cell) => {
              const htmlCell = cell as HTMLTableCellElement;
              // Ensure borders are visible
              if (!htmlCell.style.border || htmlCell.style.border === 'none') {
                htmlCell.style.border = '1px solid #d1d5db';
              }
              // Ensure padding
              if (!htmlCell.style.padding) {
                htmlCell.style.padding = '0.5rem 0.75rem';
              }
              // Ensure proper box sizing
              htmlCell.style.boxSizing = 'border-box';
              // Preserve text alignment
              const alignAttr = htmlCell.getAttribute('style');
              if (alignAttr && alignAttr.includes('text-align')) {
                // Alignment is already set, preserve it
              } else if (htmlCell.tagName === 'TD') {
                // Check if cell content looks numeric for right alignment
                const cellText = htmlCell.textContent?.trim() || '';
                const isNumeric = /^[\d,.\s%₹()\-]+$/.test(cellText) && 
                                 cellText !== '' && 
                                 cellText !== 'NA' &&
                                 !/^[A-Za-z]+$/.test(cellText);
                if (isNumeric) {
                  htmlCell.style.textAlign = 'right';
                  htmlCell.style.fontVariantNumeric = 'tabular-nums';
                }
              }
            });
            
            // Ensure table headers have background and proper styling
            const headers = htmlTable.querySelectorAll('th');
            headers.forEach((th) => {
              const htmlTh = th as HTMLTableCellElement;
              if (!htmlTh.style.backgroundColor || htmlTh.style.backgroundColor === 'transparent') {
                htmlTh.style.backgroundColor = '#f3f4f6';
              }
              htmlTh.style.fontWeight = '600';
              // Preserve header alignment
              const alignAttr = htmlTh.getAttribute('style');
              if (alignAttr && alignAttr.includes('text-align: right')) {
                htmlTh.style.textAlign = 'right';
              }
            });
            
            // Ensure table body rows have proper styling
            const rows = htmlTable.querySelectorAll('tbody tr');
            rows.forEach((row) => {
              const htmlRow = row as HTMLTableRowElement;
              htmlRow.style.borderBottom = '1px solid #d1d5db';
            });
            
            // Prevent table from breaking across pages
            htmlTable.style.pageBreakInside = 'avoid';
            htmlTable.style.breakInside = 'avoid';
          });
        },
      });
      
      console.log('Canvas created:', canvas.width, 'x', canvas.height);
      
      // Clean up
      document.body.removeChild(tempDiv);
      if (styleMonitor) {
        clearInterval(styleMonitor);
        styleMonitor = null;
      }
      
      // Restore original styles
      document.body.style.overflow = originalBodyStyles.overflow;
      document.body.style.width = originalBodyStyles.width;
      document.body.style.paddingRight = originalBodyStyles.paddingRight;
      document.body.style.position = originalBodyStyles.position;
      document.documentElement.style.overflow = originalHtmlStyles.overflow;
      document.documentElement.style.width = originalHtmlStyles.width;

      // Validate canvas
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error('Failed to generate PDF: Canvas is empty. Please try again.');
      }

      // Calculate PDF dimensions
      const pdfWidth = 210; // A4 width in mm
      const pdfHeight = 297; // A4 height in mm
      const margin = 10; // Top and bottom margin in mm
      const headerHeight = 16; // Header height in mm (reduced from 20)
      const footerHeight = 10; // Footer height in mm (reduced from 12)
      const contentPadding = 0; // No padding between header/footer and content for tighter layout
      const footerBuffer = 2; // Small buffer to prevent content from touching footer
      const usableHeight = pdfHeight - margin - headerHeight - footerHeight - contentPadding - footerBuffer;
      
      const imgWidth = pdfWidth - (margin * 2);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Get report date for footer
      const reportDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      // Use PNG format with maximum quality to preserve all image data
      const imgData = canvas.toDataURL('image/png', 1.0);
      
      // Get report name without file extension
      const reportTitle = pdfName.replace(/\.(pdf|csv|xlsx?)$/i, '').trim() || 'Chat Conversation Report';
      
      // Function to add professional header to each page
      const addHeader = (pageNum: number, totalPages: number) => {
        // Simple white background
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pdfWidth, headerHeight, 'F');
        
        // Add logo if available
        let logoX = margin;
        if (logoDataUrl) {
          try {
            const logoHeight = 8; // Logo size (restored to previous size)
            const logoWidth = (logoHeight * 27) / 22; // Maintain aspect ratio
            const logoLeftMargin = margin; // Position logo at margin
            pdf.addImage(logoDataUrl, 'PNG', logoLeftMargin, margin / 2, logoWidth, logoHeight);
            logoX = logoLeftMargin + logoWidth + 5; // Gap between logo and title
          } catch (error) {
            console.log('Error adding logo to PDF:', error);
          }
        }
        
        // Add report title (using report name without file extension)
        pdf.setFontSize(12); // Reduced for compact header
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 41, 59); // Dark professional color
        pdf.text(reportTitle, logoX, headerHeight / 2 + 1.5);
        
        // Add date on right
        pdf.setFontSize(8); // Reduced for compact header
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139); // Gray text
        const dateWidth = pdf.getTextWidth(reportDate);
        pdf.text(reportDate, pdfWidth - margin - dateWidth, headerHeight / 2 + 1);
        
        // Add separator line
        pdf.setDrawColor(226, 232, 240); // Light gray
        pdf.setLineWidth(0.2); // Thinner line for compact header
        pdf.line(margin, headerHeight - 0.5, pdfWidth - margin, headerHeight - 0.5);
      };
      
      // Function to add footer to each page
      const addFooter = (pageNum: number, totalPages: number) => {
        const footerY = pdfHeight - footerHeight; // Position footer at the very bottom
        pdf.setFillColor(248, 250, 252); // Light gray background
        pdf.rect(0, footerY, pdfWidth, footerHeight, 'F');
        
        pdf.setFontSize(7); // Reduced for compact footer
        pdf.setTextColor(100, 116, 139); // Gray text
        pdf.setFont('helvetica', 'normal');
        
        const footerText = `Generated by FYERS Intelligent Assistant | Page ${pageNum} of ${totalPages}`;
        const footerDate = `Report Date: ${reportDate}`;
        
        const textWidth = pdf.getTextWidth(footerText);
        pdf.text(footerText, (pdfWidth - textWidth) / 2, footerY + 4); // Adjusted for compact footer
        pdf.text(footerDate, (pdfWidth - pdf.getTextWidth(footerDate)) / 2, footerY + 7.5); // Adjusted for compact footer
      };
      
      // Handle multi-page content with improved page break logic
      if (imgHeight <= usableHeight) {
        // Content fits on one page
        addHeader(1, 1);
        const contentStartY = margin + headerHeight + contentPadding;
        pdf.addImage(imgData, 'PNG', margin, contentStartY, imgWidth, imgHeight);
        addFooter(1, 1);
      } else {
        // Multi-page content with smart breaks
        // First pass: Calculate actual number of pages needed with same logic as rendering
        let tempRemainingHeight = imgHeight;
        let tempSourceY = 0;
        let actualTotalPages = 0;
        
        while (tempRemainingHeight > 0 && actualTotalPages < 50) { // Max 50 pages safety
          actualTotalPages++;
          let pageContentHeight = Math.min(usableHeight - 5, tempRemainingHeight);
          
          const containerHeight = tempDiv.scrollHeight || tempDiv.offsetHeight;
          const scaleFactor = canvas.height / containerHeight;
          const sourceYpxForCheck = (tempSourceY / imgHeight) * canvas.height;
          const idealPageEndPx = sourceYpxForCheck + (pageContentHeight / imgHeight) * canvas.height;
          
          // Find natural break points
          let bestBreakPoint = pageContentHeight;
          let foundNaturalBreak = false;
          
          for (const element of breakableElements) {
            const elementTopPx = element.top * scaleFactor;
            const elementBottomPx = element.bottom * scaleFactor;
            const elementHeightPx = element.height * scaleFactor;
            // Increased buffer for better protection
            // Tables: 30% or min 60px
            // Paragraphs: 20% or min 40px (to prevent line breaks)
            // Messages: 15% or min 35px
            const buffer = element.type === 'table' 
              ? Math.max(elementHeightPx * 0.30, 60) 
              : element.type === 'paragraph'
              ? Math.max(elementHeightPx * 0.20, 40)
              : Math.max(elementHeightPx * 0.15, 35);
            const safeTop = elementTopPx - buffer;
            const safeBottom = elementBottomPx + buffer;
            
            const wouldCutElement = sourceYpxForCheck < safeBottom && idealPageEndPx > safeTop;
            
            if (wouldCutElement) {
              if (safeTop > sourceYpxForCheck && safeTop < idealPageEndPx) {
                const breakHeightPx = safeTop - sourceYpxForCheck;
                const breakHeightMm = (breakHeightPx / canvas.height) * imgHeight;
                if (breakHeightMm >= 40) {
                  bestBreakPoint = breakHeightMm - 3;
                  foundNaturalBreak = true;
                  break;
                }
              }
              
              if (sourceYpxForCheck >= safeTop && sourceYpxForCheck < safeBottom) {
                const skipToMm = (safeBottom / canvas.height) * imgHeight;
                tempSourceY = skipToMm;
                tempRemainingHeight = imgHeight - tempSourceY;
                pageContentHeight = Math.min(usableHeight - 5, tempRemainingHeight);
                continue;
              }
            }
          }
          
          if (foundNaturalBreak) {
            pageContentHeight = bestBreakPoint;
          }
          
          tempSourceY += pageContentHeight;
          tempRemainingHeight -= pageContentHeight;
        }
        
        // Second pass: Actually create the pages with correct total count
        let remainingHeight = imgHeight;
        let sourceY = 0;
        let pageNum = 1;
        
        while (remainingHeight > 0) {
          if (pageNum > 1) {
            pdf.addPage();
          }
          
          addHeader(pageNum, actualTotalPages);
          
          // Start with conservative page height with minimal buffer
          let pageContentHeight = Math.min(usableHeight - 5, remainingHeight);
          
          // Convert current position to canvas pixels
          const containerHeight = tempDiv.scrollHeight || tempDiv.offsetHeight;
          const scaleFactor = canvas.height / containerHeight;
          const sourceYpxForCheck = (sourceY / imgHeight) * canvas.height;
          const idealPageEndPx = sourceYpxForCheck + (pageContentHeight / imgHeight) * canvas.height;
          
          // Find the best break point - look for natural breaks (between messages, before tables)
          // Smart break: Don't cut content too close to top or bottom
          const minContentHeight = 40; // Minimum content per page (mm) - reduced from 50
          let bestBreakPoint = pageContentHeight;
          let foundNaturalBreak = false;
          
          // Look through all breakable elements to find a good break point
          for (const element of breakableElements) {
            const elementTopPx = element.top * scaleFactor;
            const elementBottomPx = element.bottom * scaleFactor;
            const elementHeightPx = element.height * scaleFactor;
            
            // Add larger buffer for tables, paragraphs, and messages to prevent cutting
            // Tables need most protection (30% of height or minimum 60px)
            // Paragraphs need good protection (20% or minimum 40px) to prevent line breaks
            // Messages need moderate protection (15% or minimum 35px)
            const buffer = element.type === 'table' 
              ? Math.max(elementHeightPx * 0.30, 60) 
              : element.type === 'paragraph'
              ? Math.max(elementHeightPx * 0.20, 40)
              : Math.max(elementHeightPx * 0.15, 35);
            const safeTop = elementTopPx - buffer;
            const safeBottom = elementBottomPx + buffer;
            
            // Check if we're cutting through this element
            const wouldCutElement = sourceYpxForCheck < safeBottom && idealPageEndPx > safeTop;
            
            if (wouldCutElement) {
              // Case 1: Element starts after current position but before ideal end
              // This is a good natural break point!
              if (safeTop > sourceYpxForCheck && safeTop < idealPageEndPx) {
                const breakHeightPx = safeTop - sourceYpxForCheck;
                const breakHeightMm = (breakHeightPx / canvas.height) * imgHeight;
                
                // Only use this break if we have reasonable content (at least 40mm)
                // This ensures we don't create pages with too little content
                // Reduced from 50mm to allow more flexible breaks and prevent line splitting
                if (breakHeightMm >= 40) {
                  bestBreakPoint = breakHeightMm - 3; // 3mm buffer for safety
                  foundNaturalBreak = true;
                  break; // Use first natural break we find
                }
              }
              
              // Case 2: We're starting in middle of element - skip past it
              if (sourceYpxForCheck >= safeTop && sourceYpxForCheck < safeBottom) {
                const skipToMm = (safeBottom / canvas.height) * imgHeight;
                sourceY = skipToMm;
                remainingHeight = imgHeight - sourceY;
                pageContentHeight = Math.min(usableHeight - 10, remainingHeight);
                continue; // Re-evaluate with new position
              }
              
              // Case 3: Element fits entirely on page - keep going
              if (sourceYpxForCheck <= safeTop && idealPageEndPx >= safeBottom) {
                // Element fits, continue checking
                continue;
              }
            }
          }
          
          // Use the best break point we found
          if (foundNaturalBreak) {
            pageContentHeight = bestBreakPoint;
          }
          
          // Ensure we have minimum content per page to avoid awkward breaks
          if (pageContentHeight < minContentHeight && remainingHeight > minContentHeight) {
            // Not enough space, adjust to minimum or move to next page
            pageContentHeight = Math.min(minContentHeight, remainingHeight);
          }
          
          // Calculate the source Y position in pixels (ensure we don't go beyond canvas)
          const sourceYpx = Math.min(
            Math.floor((sourceY / imgHeight) * canvas.height),
            canvas.height - 1
          );
          const sourceHeightPx = Math.max(1, Math.min(
            Math.ceil((pageContentHeight / imgHeight) * canvas.height),
            canvas.height - sourceYpx
          ));
          
          // Ensure we have valid dimensions
          if (sourceHeightPx > 0 && sourceYpx < canvas.height) {
            // Create a temporary canvas for this page's slice
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = sourceHeightPx;
            const pageCtx = pageCanvas.getContext('2d');
            
            if (pageCtx) {
              // Set white background for the slice
              pageCtx.fillStyle = '#ffffff';
              pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
              
              // Draw the slice from the original canvas with better quality
              pageCtx.imageSmoothingEnabled = true;
              pageCtx.imageSmoothingQuality = 'high';
              
              pageCtx.drawImage(
                canvas,
                0, sourceYpx, canvas.width, sourceHeightPx, // Source rectangle
                0, 0, canvas.width, sourceHeightPx // Destination rectangle
              );
              
              // Use PNG format to preserve all image data
              const pageImgData = pageCanvas.toDataURL('image/png', 1.0);
              
              // Add this page's content to PDF using PNG format with proper padding
              const contentStartY = margin + headerHeight + contentPadding;
              pdf.addImage(pageImgData, 'PNG', margin, contentStartY, imgWidth, pageContentHeight);
            }
          }
          
          addFooter(pageNum, actualTotalPages);
          
          // Move to next page
          sourceY += pageContentHeight;
          remainingHeight -= pageContentHeight;
          pageNum++;
        }
      }

      // Convert PDF to blob - use arraybuffer for better compatibility
      const pdfArrayBuffer = pdf.output('arraybuffer');
      
      // Validate PDF (should start with %PDF)
      if (pdfArrayBuffer.byteLength === 0) {
        throw new Error('PDF generation failed: empty PDF');
      }
      
      const pdfBytes = new Uint8Array(pdfArrayBuffer);
      const pdfHeader = String.fromCharCode(...pdfBytes.slice(0, 4));
      if (pdfHeader !== '%PDF') {
        console.error('Invalid PDF header:', pdfHeader);
        throw new Error('Invalid PDF generated');
      }
      
      const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
      
      // Verify blob size
      if (pdfBlob.size === 0) {
        throw new Error('PDF blob is empty');
      }
      
      // Use provided name or generate default name
      const fileName = pdfName.trim() || `chat-report-${conversationId}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}`;
      const pdfFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
      
      // Ensure blob is fully ready before creating File
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const pdfFile = new File([pdfBlob], pdfFileName, {
        type: 'application/pdf',
        lastModified: Date.now(),
      });
      
      // Final validation
      if (!pdfFile || pdfFile.size === 0) {
        throw new Error('PDF file is empty or not created properly');
      }
      
      console.log('PDF File created and validated:', {
        name: pdfFile.name,
        size: pdfFile.size,
        type: pdfFile.type,
        lastModified: pdfFile.lastModified,
      });
      
      // Store PDF in local storage for quick access
      try {
        const pdfDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(pdfBlob);
        });
        
        // Store in localStorage with conversation ID as key
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const storageKey = `chat-pdf-${conversationId}-${timestamp}`;
        localStorage.setItem(storageKey, pdfDataUrl);
        
        // Also store metadata
        const pdfMetadata = {
          conversationId,
          timestamp,
          fileName: pdfFile.name,
          size: pdfFile.size,
          storageKey,
        };
        localStorage.setItem(`${storageKey}-meta`, JSON.stringify(pdfMetadata));
        
        console.log('PDF stored in local storage:', storageKey);
      } catch (storageError) {
        console.warn('Failed to store PDF in local storage:', storageError);
        // Continue even if localStorage fails
      }
      
      console.log('PDF generated successfully:', {
        size: pdfFile.size,
        type: pdfFile.type,
        name: pdfFile.name,
      });

      // Save report - always save to Reports folder
      // For super admin, use selectedOrgId; for regular users, use their org_id
      const orgId = userInfo?.is_super_admin ? selectedOrgId : userInfo?.org_id;
      
      if (!orgId) {
        setError('Organization ID is required. Please select an organization.');
        return;
      }

      console.log('Saving PDF report:', {
        name: pdfFile.name,
        size: pdfFile.size,
        type: pdfFile.type,
        orgId,
      });

      // Additional wait to ensure file is fully ready
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify file one more time before upload
      if (!pdfFile || pdfFile.size === 0) {
        throw new Error('PDF file became invalid before upload');
      }

      // Prepare metadata
      const reportMetadata = {
        conversation_id: conversationId,
        report_type: 'chat_conversation',
        generated_at: new Date().toISOString(),
      };

      console.log('Initiating upload with file:', {
        fileName: pdfFile.name,
        fileSize: pdfFile.size,
        fileType: pdfFile.type,
        hasFile: !!pdfFile,
      });

      // FYERS org research save-report upload (Reports folder; no AI processing)
      const uploadResponse: any = await saasApi.saveReport(pdfFile, orgId, reportMetadata);
      
      console.log('Upload response:', uploadResponse);

      // Handle both response formats: { file: {...} } or { data: { file: {...} } } or direct file object
      let fileData = uploadResponse?.file || uploadResponse?.data?.file || uploadResponse?.data || uploadResponse;
      
      if (!fileData || (!fileData.id && !fileData.document_id)) {
        throw new Error('Upload failed: No file returned from server');
      }

      // Normalize file ID (could be 'id' or 'document_id') — Conflux uses string UUIDs
      const uploadedFileId = String(fileData.id ?? fileData.document_id ?? '');
      const uploadedFileName = fileData.name || fileData.filename || pdfFile.name;
      const uploadedFileSize = fileData.size_bytes || fileData.size;
      const uploadedStorageKey = fileData.storage_key || fileData.file_path;

      console.log('PDF uploaded successfully:', {
        fileId: uploadedFileId,
        fileName: uploadedFileName,
        fileSize: uploadedFileSize,
        storageKey: uploadedStorageKey,
      });

      // Store the file ID in localStorage for quick access
      try {
        const fileAccessKey = `chat-pdf-file-${conversationId}`;
        localStorage.setItem(fileAccessKey, JSON.stringify({
          fileId: uploadedFileId,
          fileName: uploadedFileName,
          uploadedAt: new Date().toISOString(),
        }));
      } catch (storageError) {
        console.warn('Failed to store file ID in localStorage:', storageError);
      }

      // Download the PDF directly from the blob we created (before uploading)
      // This ensures the user gets the exact PDF we generated
      try {
        const url = window.URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = pdfFileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
          window.URL.revokeObjectURL(url);
        }, 100);
        
        console.log('PDF downloaded successfully:', pdfFileName);
        
        // Show success toast
        showToast({
          message: `PDF report "${uploadedFileName}" saved and downloaded successfully!`,
          severity: NotificationSeverity.SUCCESS,
          showIcon: true,
          duration: 4000,
        });
      } catch (downloadErr: any) {
        console.error('Error downloading PDF:', downloadErr);
        // Still show success since file was uploaded
        showToast({
          message: `PDF report "${uploadedFileName}" saved to Reports folder!`,
          severity: NotificationSeverity.SUCCESS,
          showIcon: true,
          duration: 4000,
        });
      }
      
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save report');
      console.error('Error saving report:', err);
      
      // Clean up style monitor if error occurs
      if (styleMonitor) {
        clearInterval(styleMonitor);
      }
      
      // Restore original styles
      document.body.style.overflow = originalBodyStyles.overflow;
      document.body.style.width = originalBodyStyles.width;
      document.body.style.paddingRight = originalBodyStyles.paddingRight;
      document.body.style.position = originalBodyStyles.position; 
      document.documentElement.style.overflow = originalHtmlStyles.overflow;
      document.documentElement.style.width = originalHtmlStyles.width;
    } finally {
      setSaving(false);
    }
  };

  const isSuperAdmin = userInfo?.is_super_admin || false;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-6 sm:max-w-md bg-[#F7F7F7] dark:bg-[#222222]">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-semibold">Save PDF Report</DialogTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Your report will be saved to the Reports folder
          </p>
        </DialogHeader>
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* Organization selector for super admin */}
          {isSuperAdmin && organizations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Organization *
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-[#FFFFFF] dark:bg-[#111111] text-gray-900 dark:text-gray-100"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} {org.legal_name ? `(${org.legal_name})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Select an organization to save the report to its resources
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Report Name *
            </label>
            <input
              type="text"
              value={pdfName}
              onChange={(e) => setPdfName(e.target.value)}
              placeholder="Enter report name (e.g., Q4 Analysis Report)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-[#FFFFFF] dark:bg-[#111111] text-gray-900 dark:text-gray-100"
              disabled={saving}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              The report will be saved to the "Reports" folder
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" onClick={onClose} variant="outline" disabled={saving} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium border border-gray-300 dark:border-gray-400 rounded-lg focus:outline-none focus:ring-0">
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={saving || loading || (isSuperAdmin && !selectedOrgId) || !pdfName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium focus:outline-none focus:ring-0"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Report'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}



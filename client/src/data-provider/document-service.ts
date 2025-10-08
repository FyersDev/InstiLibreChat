/**
 * Document service for external document management API
 * Handles document upload and retrieval from the external service
 */

import { request } from './request';

// External API base URL
const DOCUMENT_API_BASE = 'http://10.13.6.115:8000';

export interface DocumentUploadResponse {
  code: number;
  message: string;
  s: string;
  data?: any;
}

export interface DocumentListItem {
  filename: string;
  company_name: string;
  owner: string;
  upload_date: string;
  format: string;
  status: string;
}

export interface DocumentListResponse {
  code: number;
  message: string;
  s: string;
  data: DocumentListItem[];
}

/**
 * Upload a document to the external document service
 */
export const uploadDocument = async (
  file: File,
  owner: string = 'default_user'
): Promise<DocumentUploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('db_backend', 'docling_postgres');
  formData.append('owner', owner);

  try {
    const response = await fetch(`${DOCUMENT_API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });

    console.log('response', response);
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Document upload error:', error);
    throw error;
  }
};

/**
 * Fetch list of available documents from the external service
 */
export const fetchDocuments = async (username: string = 'all'): Promise<DocumentListResponse> => {
  try {
    const response = await fetch(`${DOCUMENT_API_BASE}/fetch/${username}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Document fetch error:', error);
    throw error;
  }
};

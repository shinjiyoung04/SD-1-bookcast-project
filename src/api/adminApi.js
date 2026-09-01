import axios from 'axios'

const API_BASE_URL =
  import.meta.env.VITE_API_SERVER_URL ||
  'http://localhost:8080/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
})

export const getAdminMe = async (
  requesterUserId,
) => {
  const response = await apiClient.get(
    '/admin/me',
    {
      params: {
        requesterUserId,
      },
    },
  )

  return response.data
}

export const getAdminDashboard = async (
  requesterUserId,
) => {
  const response = await apiClient.get(
    '/admin/dashboard',
    {
      params: {
        requesterUserId,
      },
    },
  )

  return response.data
}

export const getAdminApplications = async ({
  requesterUserId,
  keyword = '',
  status = 'ALL',
  sort = 'LATEST',
  page = 1,
  pageSize = 10,
}) => {
  const response = await apiClient.get(
    '/admin/applications',
    {
      params: {
        requesterUserId,
        keyword,
        status,
        sort,
        page,
        pageSize,
      },
    },
  )

  return response.data
}

export const getAdminApplication = async ({
  requesterUserId,
  applicationId,
}) => {
  const response = await apiClient.get(
    `/admin/applications/${applicationId}`,
    {
      params: {
        requesterUserId,
      },
    },
  )

  return response.data
}

export const decideAdminApplication = async ({
  requesterUserId,
  applicationId,
  decision,
  adminComment,
}) => {
  const response = await apiClient.patch(
    `/admin/applications/${applicationId}/decision`,
    {
      requesterUserId,
      decision,
      adminComment,
    },
  )

  return response.data
}

export const getAdminMembers = async ({
  requesterUserId,
  keyword = '',
  role = 'ALL',
  status = 'ACTIVE',
  page = 1,
  pageSize = 10,
}) => {
  const response = await apiClient.get(
    '/admin/members',
    {
      params: {
        requesterUserId,
        keyword,
        role,
        status,
        page,
        pageSize,
      },
    },
  )

  return response.data
}

export const updateAdminMemberRole = async ({
  requesterUserId,
  targetUserId,
  role,
  managedLibraryId,
}) => {
  const response = await apiClient.patch(
    `/admin/members/${targetUserId}/role`,
    {
      requesterUserId,
      role,
      managedLibraryId:
        managedLibraryId || null,
    },
  )

  return response.data
}

export const getAdminLibraries = async (
  requesterUserId,
) => {
  const response = await apiClient.get(
    '/admin/libraries',
    {
      params: {
        requesterUserId,
      },
    },
  )

  return response.data
}

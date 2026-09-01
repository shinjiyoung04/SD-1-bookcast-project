import { create } from "zustand";
import { persist } from "zustand/middleware";

const useMemberStore = create(
  persist(
    (set) => ({
      member: null,
      accessToken: null,

      login: (loginData) =>
        set({
          member: {
            userId: loginData.userId ?? loginData.user_id ?? null,

            loginId: loginData.loginId ?? loginData.login_id ?? "",

            name: loginData.name ?? "",
            email: loginData.email ?? "",
            nickname: loginData.nickname ?? "",

            profileImageUrl:
              loginData.profileImageUrl ?? loginData.profile_image_url ?? null,

            profileImage:
              loginData.profileImageUrl ??
              loginData.profile_image_url ??
              loginData.profileImage ??
              null,

            role: loginData.role,
            status: loginData.status,

            provider: loginData.provider,

            social: loginData.provider === "KAKAO",

            newUser: loginData.newUser || false,

            // 관리자 소속 도서관 정보
            managedLibraryId:
              loginData.managedLibraryId ??
              loginData.managed_library_id ??
              null,

            managedLibraryCode:
              loginData.managedLibraryCode ??
              loginData.managed_library_code ??
              null,

            managedLibraryName:
              loginData.managedLibraryName ??
              loginData.managed_library_name ??
              loginData.managedLibrary?.libraryName ??
              loginData.libraryName ??
              "",
          },

          accessToken: loginData.accessToken || null,
        }),

      logout: () =>
        set({
          member: null,
          accessToken: null,
        }),

      updateMember: (memberData) =>
        set((state) => ({
          member: {
            ...state.member,
            ...memberData,

            managedLibraryId:
              memberData.managedLibraryId ??
              memberData.managed_library_id ??
              state.member?.managedLibraryId ??
              null,

            managedLibraryCode:
              memberData.managedLibraryCode ??
              memberData.managed_library_code ??
              state.member?.managedLibraryCode ??
              null,

            managedLibraryName:
              memberData.managedLibraryName ??
              memberData.managed_library_name ??
              memberData.managedLibrary?.libraryName ??
              memberData.libraryName ??
              state.member?.managedLibraryName ??
              "",
          },
        })),
    }),
    {
      name: "teamproject-member-storage",
    },
  ),
);

export default useMemberStore;

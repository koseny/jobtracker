export type IdentityUser = {
  id: string;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
};

export type IdentityState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: IdentityUser };

export interface IdentityAdapter {
  subscribe(listener: (state: IdentityState) => void): () => void;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
}

export interface Notifier {
  sendConfirmationEmail(params: {
    email: string;
    repoFullName: string;
    confirmToken: string;
    unsubToken: string;
  }): Promise<void>;

  sendReleaseNotification(params: {
    email: string;
    repoFullName: string;
    tagName: string;
    unsubToken: string;
  }): Promise<void>;
}

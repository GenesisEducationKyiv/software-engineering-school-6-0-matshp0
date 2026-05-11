export interface Notifier {
  sendConfirmationEmail(
    email: string,
    repoFullName: string,
    confirmToken: string,
    unsubToken: string,
  ): Promise<void>;

  sendReleaseNotification(
    email: string,
    repoFullName: string,
    tagName: string,
    unsubToken: string,
  ): Promise<void>;
}

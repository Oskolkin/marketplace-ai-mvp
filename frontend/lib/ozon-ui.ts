export function mapConnectionStatus(status: string | null | undefined): string {
  switch (status) {
    case "draft":
      return "Не подключено";
    case "checking":
      return "Проверка";
    case "valid":
      return "Подключено";
    case "invalid":
      return "Неверные учётные данные";
    case "sync_pending":
      return "Ожидает синхронизации";
    case "sync_in_progress":
      return "Синхронизация";
    case "sync_failed":
      return "Сбой синхронизации";
    default:
      return "Неизвестно";
  }
}

export function mapPerformanceConnectionStatus(
  status: string | null | undefined
): string {
  switch (status) {
    case "not_configured":
      return "Токен Performance не задан";
    case "unknown":
      return "Performance API ещё не проверялся";
    case "valid":
      return "Performance API: ОК";
    case "invalid":
      return "Ошибка Performance API";
    case "not_connected":
      return "Нет подключения Ozon";
    default:
      return "Неизвестно";
  }
}

export function mapSyncStatus(status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return "Ожидает синхронизации";
    case "running":
      return "Синхронизация";
    case "completed":
      return "Синхронизация завершена";
    case "failed":
      return "Сбой синхронизации";
    default:
      return "Не запускалось";
  }
}

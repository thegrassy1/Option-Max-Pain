/**
 * Expiration Date Filtering
 * Filters options to show only monthly and quarterly expirations
 */

/**
 * Check if a date is a monthly expiration (typically 3rd Friday of month)
 * or quarterly expiration (end of quarter months)
 */
export function isMonthlyOrQuarterlyExpiration(expirationDate: Date): boolean {
  const day = expirationDate.getDate();
  const month = expirationDate.getMonth();
  const dayOfWeek = expirationDate.getDay(); // 0 = Sunday, 5 = Friday
  
  // Quarterly expirations: End of March, June, September, December
  // Typically last Friday of quarter month (last business day)
  const isQuarterMonth = month === 2 || month === 5 || month === 8 || month === 11;
  const isQuarterEnd = isQuarterMonth && 
                       (dayOfWeek === 5 && day >= 25 && day <= 31); // Last Friday of quarter month
  
  // Monthly expirations: Typically 3rd Friday of month (15th-21st range)
  // For non-quarter months, also accept last Friday
  // Also accept any Friday in the 2nd half of month (15th-31st) for monthly expirations
  const isThirdFriday = day >= 15 && day <= 21 && dayOfWeek === 5;
  const isLastFriday = !isQuarterMonth && day >= 22 && day <= 28 && dayOfWeek === 5;
  const isMonthlyFriday = !isQuarterMonth && day >= 15 && day <= 31 && dayOfWeek === 5;
  
  return isThirdFriday || isLastFriday || isMonthlyFriday || isQuarterEnd;
}

/**
 * Check if expiration is monthly (3rd Friday pattern)
 */
export function isMonthlyExpiration(expirationDate: Date): boolean {
  const day = expirationDate.getDate();
  const dayOfWeek = expirationDate.getDay();
  
  // Monthly: 3rd Friday (typically 15th-21st) or last Friday
  return (day >= 15 && day <= 21 && dayOfWeek === 5) || 
         (day >= 22 && day <= 28 && dayOfWeek === 5);
}

/**
 * Check if expiration is quarterly (end of quarter)
 */
export function isQuarterlyExpiration(expirationDate: Date): boolean {
  const day = expirationDate.getDate();
  const month = expirationDate.getMonth();
  
  // Quarterly: End of March (2), June (5), September (8), December (11)
  return (month === 2 || month === 5 || month === 8 || month === 11) && 
         (day >= 25 && day <= 31);
}

/**
 * Filter options to only monthly and quarterly expirations
 */
export function filterMonthlyQuarterlyOptions<T extends { expiration: number }>(
  options: T[]
): T[] {
  const today = new Date();
  
  return options.filter(option => {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + option.expiration);
    
    return isMonthlyOrQuarterlyExpiration(expirationDate);
  });
}

/**
 * Get expiration type label
 */
export function getExpirationType(expirationDate: Date): string {
  if (isQuarterlyExpiration(expirationDate)) {
    return 'Quarterly';
  }
  if (isMonthlyExpiration(expirationDate)) {
    return 'Monthly';
  }
  return 'Other';
}


declare global {
  interface Error {
    response?: any;
    statusCode?: number;
    $metadata?: {
      httpStatusCode?: number;
    };
  }

  // eslint-disable-next-line no-var
  var testUtils: any;
}

export {};

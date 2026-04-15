function run({ identity, data, config }) {
  // Expected input:
  // {
  //   data: {
  //     logInfo: { ... }
  //   },
  //   config: { ... }
  // }
  //
  // Required behavior:
  // return the same payload shape App Connect sent you. You may transform
  // fields like note or additionalSubmission, but do not remove required data.
  const originalNote = data?.note || '';
  const ignoreLetters = config.ignoreLetters || '';

  let note = '';
  for (const letter of originalNote) {
    note += ignoreLetters.value.includes(letter) ? letter : letter.toUpperCase();
  }

  return {
    ...data,
    pluginIdentity: identity,
    note
  };
}

exports.run = run;
if (process.stdout && typeof process.stdout._writev === 'function') {
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = function(data, encoding, cb) {
    const result = origWrite(data, encoding, cb);
    if (typeof process.stdout._flush === 'function') process.stdout._flush();
    return result;
  };
}

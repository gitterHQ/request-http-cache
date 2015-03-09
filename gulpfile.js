var gulp = require('gulp'),
    mocha = require('gulp-spawn-mocha');

gulp.task('test', function() {
  return gulp
    .src(['test/*.test.js'])
    .pipe(mocha({
      env: { },
      istanbul: {
        dir: 'output/coverage/'
      }
    }));
});

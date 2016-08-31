module.exports = function(grunt) {


  var js_backend = [
  ];

  var js_frontend = [
    './bower_components/bootstrap/dist/js/bootstrap.min.js',
/*    './bower_components/bootstrap3-dialog/dist/js/bootstrap-dialog.min.js',
    './bower_components/bootstrap-contextmenu/bootstrap-contextmenu.js',
    './bower_components/mjolnic-bootstrap-colorpicker/dist/js/bootstrap-colorpicker.min.js',
    './bower_components/typeahead.js/dist/typeahead.jquery.min.js', 
    './app/assets/javascript/libs/vex.combined.min.js',*/
    './app/assets/javascript/frontend.js'
  ];

  //Initializing the configuration object
    grunt.initConfig({

      // Task configuration
    less: {
        development: {
            options: {
              compress: true,  //minifying the result
            },
            files: {
              //compiling frontend.less into frontend.css
              "./public/assets/stylesheets/frontend.css":"./app/assets/stylesheets/frontend.less",
              //compiling backend.less into backend.css
              "./public/assets/stylesheets/backend.css":"./app/assets/stylesheets/backend.less"
            }
        }
    },
    concat: {
      options: {
        separator: ';',
      },
      js_frontend: {
        src: js_frontend,
        dest: './public/assets/javascript/frontend.js',
      },
      js_backend: {
        src: js_backend,
        dest: './public/assets/javascript/backend.js',
      }
    },
    copy: {
      files: {
        files: [
          {expand: true, src: ['bower_components/bootstrap/dist/fonts/*'], dest: './public/assets/fonts/', filter: 'isFile', flatten: true},
          //{expand: true, src: ['bower_components/font-awesome/fonts/*'], dest: './public/assets/fonts/', filter: 'isFile', flatten: true},
          {expand: true, src: ['bower_components/jquery/dist/jquery.min.js'], dest: './public/assets/javascript/', filter: 'isFile', flatten: true},
        ]
      }
    },
    uglify: {
      options: {
        mangle: false  // Use if you want the names of your functions and variables unchanged
      },
      frontend: {
        files: {
          './public/assets/javascript/frontend.js': './public/assets/javascript/frontend.js',
        }
      },
      backend: {
        files: {
          './public/assets/javascript/backend.js': './public/assets/javascript/backend.js',
        }
      },
    },
    phpunit: {
        classes: {
        },
        options: {
        }
    },
    watch: {
        js_frontend: {
          files: js_frontend,
          tasks: ['concat:js_frontend'/*,'uglify:frontend'*/],     //tasks to run
          options: {
            livereload: true                        //reloads the browser
          }
        },
        js_backend: {
          files: js_backend,
          tasks: ['concat:js_backend','uglify:backend'],     //tasks to run
          options: {
            livereload: true                        //reloads the browser
          }
        },
        less: {
          files: ['./app/assets/stylesheets/*.less'],  //watched files
          tasks: ['less'],                          //tasks to run
          options: {
            livereload: true                        //reloads the browser
          }
        },
 /*       tests: {
          files: ['app/controllers/*.php','app/models/*.php'],  //the task will run only when you save files in this location
          tasks: ['phpunit']
        }*/
      }
    });

  // Plugin loading
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-copy');
  //grunt.loadNpmTasks('grunt-phpunit');

  // Task definition
  grunt.registerTask('default', ['watch']);

};

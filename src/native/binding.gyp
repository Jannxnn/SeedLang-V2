{
  "targets": [
    {
      "target_name": "seedlang_native",
      "sources": [
        "src/native/cpp/seedlang_native.cc",
        "src/native/cpp/math_extreme.cc",
        "src/native/cpp/array_extreme.cc",
        "src/native/cpp/string_extreme.cc",
        "src/native/cpp/memory_extreme.cc"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags": ["-O3", "-std=c++17"],
      "cflags_cc": ["-O3", "-std=c++17"],
      "conditions": [
        ["OS=='win'", {
          "defines": ["WIN32"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/O2", "/std:c++17"]
            }
          }
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          }
        }]
      ]
    }
  ]
}
